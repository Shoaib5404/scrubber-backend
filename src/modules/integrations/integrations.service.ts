import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditCategoryCode } from '../audit/audit.catalog';
import { AuditService } from '../audit/audit.service';
import { isTenantRole, UserRole } from '../auth/auth.constants';
import { ApiClientIssuerService } from '../ops-cli/api-client-issuer.service';
import {
  FEATURE_REQUIRED_MESSAGE,
  TenantFeatureCode,
} from '../tenants/tenant-features.constants';
import { TenantFeaturesService } from '../tenants/tenant-features.service';

function serializeClient(client: {
  id: number;
  name: string;
  clientId: string;
  userId: number | null;
  tenantId: number | null;
  isActive: boolean;
  scopes: unknown;
  lastUsedAt: Date | null;
  createdAt: Date;
}) {
  return {
    id: client.id,
    name: client.name,
    client_id: client.clientId,
    user_id: client.userId,
    tenant_id: client.tenantId,
    is_active: client.isActive,
    scopes: client.scopes,
    last_used_at: client.lastUsedAt?.toISOString() ?? null,
    created_at: client.createdAt.toISOString(),
  };
}

@Injectable()
export class IntegrationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly issuer: ApiClientIssuerService,
    private readonly tenantFeatures: TenantFeaturesService,
    private readonly audit: AuditService,
  ) {}

  async show(userId: number) {
    const user = await this.requireTenantMember(userId);
    const client = await this.findTenantClient(user.tenantId!, userId);
    const hasApiAccess = await this.tenantFeatures.has(
      user.tenantId!,
      TenantFeatureCode.ApiAccess,
    );
    const roleCanCreate =
      user.role === UserRole.TenantAdmin || user.role === UserRole.Customer;
    return {
      api_client: client ? serializeClient(client) : null,
      can_create: roleCanCreate && hasApiAccess,
      api_access: hasApiAccess,
    };
  }

  /** Issue organization API credentials when none exist yet (tenant admin / customer). */
  async createCredentials(userId: number) {
    const user = await this.requireTenantMember(userId);
    if (user.role !== UserRole.TenantAdmin && user.role !== UserRole.Customer) {
      throw new ForbiddenException('Not allowed to create API credentials.');
    }
    await this.requireApiAccess(user.tenantId!);

    const existing = await this.findTenantClient(user.tenantId!, userId);
    if (existing) {
      throw new ForbiddenException(
        'API credentials already exist. Use rotate secret instead.',
      );
    }

    const allowed = await this.tenantFeatures.allowedScopes(user.tenantId!);
    if (allowed.length === 0) {
      throw new ForbiddenException(
        'No API scopes are enabled for your subscription. Please contact support.',
      );
    }

    const issued = await this.issuer.issueForCustomer(
      String(userId),
      `${user.name} API`,
    );
    const client = await this.prisma.apiClient.findUniqueOrThrow({
      where: { id: issued.client.id },
    });

    this.audit.record({
      category: AuditCategoryCode.SettingsIntegrations,
      action: 'created',
      actorUserId: userId,
      actorRole: user.role,
      tenantId: user.tenantId,
      resourceType: 'api_client',
      resourceId: client.id,
      metadata: { client_id: client.clientId },
    });

    return {
      message:
        'API credentials created. Copy the client secret now — it will not be shown again.',
      api_client: serializeClient(client),
      plain_client_secret: issued.plainSecret,
    };
  }

  async rotateSecret(userId: number) {
    const user = await this.requireTenantMember(userId);
    if (user.role !== UserRole.TenantAdmin && user.role !== UserRole.Customer) {
      throw new ForbiddenException('Customer access required.');
    }
    await this.requireApiAccess(user.tenantId!);

    const client = await this.findTenantClient(user.tenantId!, userId);
    if (!client) {
      throw new NotFoundException('API credentials are not set up yet.');
    }
    if (!client.isActive) {
      throw new ForbiddenException(
        'These credentials are revoked. Create new credentials or ask support to reissue them.',
      );
    }

    // Tenant admins may rotate any tenant client; customers only their own.
    if (
      user.role === UserRole.Customer &&
      client.userId != null &&
      client.userId !== userId
    ) {
      throw new ForbiddenException('Not allowed to rotate these API credentials.');
    }

    const issued = await this.issuer.rotateSecret(client.id);
    const refreshed = await this.prisma.apiClient.findUniqueOrThrow({
      where: { id: client.id },
    });

    this.audit.record({
      category: AuditCategoryCode.SettingsIntegrations,
      action: 'rotated',
      actorUserId: userId,
      actorRole: user.role,
      tenantId: user.tenantId,
      resourceType: 'api_client',
      resourceId: client.id,
      metadata: { client_id: client.clientId },
    });

    return {
      message: 'Client secret rotated. Copy it now — it will not be shown again.',
      api_client: serializeClient(refreshed),
      plain_client_secret: issued.plainSecret,
    };
  }

  private async requireApiAccess(tenantId: number) {
    if (!(await this.tenantFeatures.has(tenantId, TenantFeatureCode.ApiAccess))) {
      throw new ForbiddenException(FEATURE_REQUIRED_MESSAGE);
    }
  }

  private async findTenantClient(tenantId: number, userId: number) {
    const byUser = await this.prisma.apiClient.findUnique({ where: { userId } });
    if (byUser) return byUser;
    return this.prisma.apiClient.findFirst({
      where: { tenantId, isActive: true },
      orderBy: { id: 'asc' },
    });
  }

  private async requireTenantMember(userId: number) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !isTenantRole(user.role) || user.tenantId == null) {
      throw new ForbiddenException('Customer access required.');
    }
    return user;
  }
}
