import {
  Inject,
  Injectable,
  UnauthorizedException,
  UnprocessableEntityException,
  forwardRef,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TenantFeaturesService } from '../tenants/tenant-features.service';
import {
  ACCOUNT_DEACTIVATED_MESSAGE,
  DEFAULT_CUSTOMER_SCOPES,
  TENANT_SUSPENDED_MESSAGE,
  isStaffRole,
  isTenantRole,
} from './auth.constants';
import { AuditCategoryCode } from '../audit/audit.catalog';
import { AuditService } from '../audit/audit.service';
import { PasswordService } from './password.service';
import { RolePermissionService } from './role-permission.service';

export type AuthSession = {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  user: {
    id: number;
    email: string;
    name: string;
    role: string;
    tenant_id: number | null;
    email_verified: boolean;
    permissions: string[];
    subscription_status: string;
    subscription_active: boolean;
    features: string[];
  };
  /** Present for inactive customers (login warning). */
  warning?: string;
};

export type AccessTokenResponse = {
  token_type: 'Bearer';
  access_token: string;
  expires_in: number;
  expires_at: string;
  scopes: string[];
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly passwords: PasswordService,
    private readonly rolePermissions: RolePermissionService,
    private readonly tenantFeatures: TenantFeaturesService,
    @Inject(forwardRef(() => AuditService))
    private readonly audit: AuditService,
  ) {}

  async login(email: string, password: string): Promise<AuthSession> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { tenant: true },
    });
    if (!user || !(await this.passwords.verifyPassword(password, user.password))) {
      throw new UnauthorizedException('Invalid credentials.');
    }
    if (!user.isActive) {
      throw new UnauthorizedException(ACCOUNT_DEACTIVATED_MESSAGE);
    }
    if (user.tenant?.status === 'suspended' && !isStaffRole(user.role)) {
      throw new UnauthorizedException(TENANT_SUSPENDED_MESSAGE);
    }

    const session = await this.issueUserSession(user);
    this.audit.record({
      category: AuditCategoryCode.AuthLogin,
      action: 'succeeded',
      actorType: 'user',
      actorUserId: user.id,
      actorRole: user.role,
      tenantId: user.tenantId,
      system: true,
      resourceType: 'user',
      resourceId: user.id,
    });
    return session;
  }

  async refresh(refreshToken: string): Promise<AuthSession> {
    const tokenHash = this.passwords.hashToken(refreshToken);
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: { include: { tenant: true } } },
    });
    if (!stored || stored.revokedAt || stored.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Invalid refresh token.');
    }
    if (!stored.user.isActive) {
      throw new UnauthorizedException(ACCOUNT_DEACTIVATED_MESSAGE);
    }
    if (stored.user.tenant?.status === 'suspended' && !isStaffRole(stored.user.role)) {
      throw new UnauthorizedException(TENANT_SUSPENDED_MESSAGE);
    }

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    return this.issueUserSession(stored.user);
  }

  async logout(refreshToken: string): Promise<void> {
    const tokenHash = this.passwords.hashToken(refreshToken);
    const stored = await this.prisma.refreshToken.findFirst({
      where: { tokenHash },
      select: { userId: true, user: { select: { role: true, tenantId: true } } },
    });
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (stored) {
      this.audit.record({
        category: AuditCategoryCode.AuthLogout,
        action: 'succeeded',
        actorType: 'user',
        actorUserId: stored.userId,
        actorRole: stored.user.role,
        tenantId: stored.user.tenantId,
        system: true,
        resourceType: 'user',
        resourceId: stored.userId,
      });
    }
  }

  async issueApiClientToken(
    clientId: string,
    clientSecret: string,
  ): Promise<AccessTokenResponse> {
    const client = await this.prisma.apiClient.findUnique({
      where: { clientId },
      include: { user: { include: { tenant: true } }, tenant: true },
    });

    if (!client || !(await this.passwords.verifySecret(clientSecret, client.clientSecret))) {
      this.audit.record({
        category: AuditCategoryCode.AuthApiTokenIssue,
        action: 'failed',
        actorType: 'system',
        system: true,
        metadata: { reason: 'invalid_credentials' },
      });
      throw new UnprocessableEntityException({
        message: 'Validation failed',
        errors: { client_id: ['Invalid client credentials.'] },
      });
    }
    if (!client.isActive) {
      throw new UnprocessableEntityException({
        message: 'Validation failed',
        errors: { client_id: ['This API client has been revoked.'] },
      });
    }

    const tenant = client.tenant ?? client.user?.tenant ?? null;
    if (tenant?.status === 'suspended') {
      throw new UnprocessableEntityException({
        message: 'Validation failed',
        errors: { client_id: [TENANT_SUSPENDED_MESSAGE] },
      });
    }

    // Platform service clients (NeoMD own apps): unbound from tenant subscription/features.
    // Tenant-bound customers still require active subscription + feature-derived scopes below.
    const isServiceClient = client.userId === null && client.tenantId == null;
    if (!isServiceClient) {
      if (client.userId != null && (!client.user || !client.user.isActive)) {
        throw new UnprocessableEntityException({
          message: 'Validation failed',
          errors: { client_id: ['The customer account is inactive.'] },
        });
      }
      if (!this.tenantHasActiveSubscription(tenant ?? client.user)) {
        throw new UnprocessableEntityException({
          message: 'Validation failed',
          errors: { client_id: ['The customer subscription is not active.'] },
        });
      }
    }

    let scopes =
      Array.isArray(client.scopes) && (client.scopes as string[]).length > 0
        ? (client.scopes as string[])
        : [...DEFAULT_CUSTOMER_SCOPES];

    // Tenant-bound clients: intersect stored scopes with current feature entitlements.
    const boundTenantId = client.tenantId ?? client.user?.tenantId ?? null;
    if (!isServiceClient && boundTenantId != null) {
      const allowed = await this.tenantFeatures.allowedScopes(boundTenantId);
      const allowedSet = new Set(allowed);
      scopes = scopes.filter((s) => allowedSet.has(s as (typeof allowed)[number]));
    }

    const expiresInMinutes = this.config.get<number>('API_TOKEN_EXPIRATION_MINUTES', 60);
    const expiresAt = new Date(Date.now() + expiresInMinutes * 60_000);
    const accessToken = await this.jwt.signAsync(
      {
        typ: 'api_client',
        sub: `client:${client.id}`,
        clientId: client.clientId,
        userId: client.userId,
        tenantId: client.tenantId ?? client.user?.tenantId ?? null,
        scopes,
      },
      {
        secret: this.config.getOrThrow<string>('JWT_SECRET'),
        expiresIn: `${expiresInMinutes}m`,
        issuer: this.config.get<string>('JWT_ISSUER', 'neo-scrubber'),
        audience: this.config.get<string>('JWT_AUDIENCE', 'neo-scrubber-api'),
      },
    );

    await this.prisma.apiClient.update({
      where: { id: client.id },
      data: { lastUsedAt: new Date() },
    });

    this.audit.record({
      category: AuditCategoryCode.AuthApiTokenIssue,
      action: 'succeeded',
      actorType: 'api_client',
      actorApiClientId: client.id,
      actorUserId: client.userId,
      tenantId: client.tenantId ?? client.user?.tenantId ?? null,
      system: true,
      resourceType: 'api_client',
      resourceId: client.id,
      metadata: { client_id: client.clientId },
    });

    return {
      token_type: 'Bearer',
      access_token: accessToken,
      expires_in: expiresInMinutes * 60,
      expires_at: expiresAt.toISOString(),
      scopes,
    };
  }

  /** @deprecated Prefer tenantHasActiveSubscription for tenant-scoped principals. */
  ownerHasActiveSubscription(user: {
    role?: string;
    isActive?: boolean;
    subscriptionStatus: string;
    subscriptionEndsAt: Date | null;
  }): boolean {
    if (user.role && isStaffRole(user.role)) {
      return true;
    }
    if (user.isActive === false) {
      return false;
    }
    if (user.subscriptionStatus !== 'active') {
      return false;
    }
    if (user.subscriptionEndsAt && user.subscriptionEndsAt.getTime() < Date.now()) {
      return false;
    }
    return true;
  }

  tenantHasActiveSubscription(
    source:
      | {
          role?: string;
          isActive?: boolean;
          status?: string;
          subscriptionStatus: string;
          subscriptionEndsAt: Date | null;
        }
      | null
      | undefined,
  ): boolean {
    if (!source) {
      return false;
    }
    if (source.role && isStaffRole(source.role)) {
      return true;
    }
    if (source.status === 'suspended') {
      return false;
    }
    return this.ownerHasActiveSubscription({
      role: source.role,
      isActive: source.isActive,
      subscriptionStatus: source.subscriptionStatus,
      subscriptionEndsAt: source.subscriptionEndsAt,
    });
  }

  private async issueUserSession(user: {
    id: number;
    email: string;
    name: string;
    role: string;
    tenantId?: number | null;
    emailVerifiedAt?: Date | null;
    isActive: boolean;
    subscriptionStatus: string;
    subscriptionEndsAt: Date | null;
    tenant?: {
      status: string;
      subscriptionStatus: string;
      subscriptionEndsAt: Date | null;
    } | null;
  }): Promise<AuthSession> {
    const accessTtlMin = this.config.get<number>('JWT_ACCESS_TTL', 60);
    const refreshTtlDays = this.config.get<number>('JWT_REFRESH_TTL', 30);

    const accessToken = await this.jwt.signAsync(
      {
        typ: 'user',
        sub: `user:${user.id}`,
        userId: user.id,
        tenantId: user.tenantId ?? null,
        email: user.email,
        role: user.role,
        scopes: [],
      },
      {
        secret: this.config.getOrThrow<string>('JWT_SECRET'),
        expiresIn: `${accessTtlMin}m`,
        issuer: this.config.get<string>('JWT_ISSUER', 'neo-scrubber'),
        audience: this.config.get<string>('JWT_AUDIENCE', 'neo-scrubber-api'),
      },
    );

    const refreshToken = this.passwords.generateRefreshToken();
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: this.passwords.hashToken(refreshToken),
        expiresAt: new Date(Date.now() + refreshTtlDays * 24 * 60 * 60_000),
      },
    });

    const permissions = await this.rolePermissions.permissionValuesForRole(user.role);
    const subscriptionSource = user.tenant
      ? {
          role: user.role,
          isActive: user.isActive,
          status: user.tenant.status,
          subscriptionStatus: user.tenant.subscriptionStatus,
          subscriptionEndsAt: user.tenant.subscriptionEndsAt,
        }
      : user;
    const subscriptionActive = this.tenantHasActiveSubscription(subscriptionSource);
    const features =
      user.tenantId != null && isTenantRole(user.role)
        ? await this.tenantFeatures.list(user.tenantId)
        : [];
    const session: AuthSession = {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: accessTtlMin * 60,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        tenant_id: user.tenantId ?? null,
        email_verified: !!user.emailVerifiedAt,
        permissions,
        subscription_status: user.tenant?.subscriptionStatus ?? user.subscriptionStatus,
        subscription_active: subscriptionActive,
        features,
      },
    };

    if (isTenantRole(user.role) && !subscriptionActive) {
      session.warning =
        'Your subscription is not active. You can view existing batches, but upload and validation are unavailable until it is renewed.';
    }

    return session;
  }
}
