import {
  Injectable,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  DEFAULT_CUSTOMER_SCOPES,
  isStaffRole,
  UserRole,
} from './auth.constants';
import { PasswordService } from './password.service';

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
  };
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
  ) {}

  async login(email: string, password: string): Promise<AuthSession> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !(await this.passwords.verifyPassword(password, user.password))) {
      throw new UnauthorizedException('Invalid credentials.');
    }
    if (!user.isActive) {
      throw new UnauthorizedException('This account is inactive.');
    }

    return this.issueUserSession(user);
  }

  async refresh(refreshToken: string): Promise<AuthSession> {
    const tokenHash = this.passwords.hashToken(refreshToken);
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });
    if (!stored || stored.revokedAt || stored.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Invalid refresh token.');
    }
    if (!stored.user.isActive) {
      throw new UnauthorizedException('This account is inactive.');
    }

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    return this.issueUserSession(stored.user);
  }

  async logout(refreshToken: string): Promise<void> {
    const tokenHash = this.passwords.hashToken(refreshToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async issueApiClientToken(
    clientId: string,
    clientSecret: string,
  ): Promise<AccessTokenResponse> {
    const client = await this.prisma.apiClient.findUnique({
      where: { clientId },
      include: { user: true },
    });

    if (!client || !(await this.passwords.verifySecret(clientSecret, client.clientSecret))) {
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

    const isServiceClient = client.userId === null;
    if (!isServiceClient) {
      if (!client.user || !client.user.isActive) {
        throw new UnprocessableEntityException({
          message: 'Validation failed',
          errors: { client_id: ['The customer account is inactive.'] },
        });
      }
      if (!this.ownerHasActiveSubscription(client.user)) {
        throw new UnprocessableEntityException({
          message: 'Validation failed',
          errors: { client_id: ['The customer subscription is not active.'] },
        });
      }
    }

    const scopes =
      Array.isArray(client.scopes) && (client.scopes as string[]).length > 0
        ? (client.scopes as string[])
        : [...DEFAULT_CUSTOMER_SCOPES];

    const expiresInMinutes = this.config.get<number>('API_TOKEN_EXPIRATION_MINUTES', 60);
    const expiresAt = new Date(Date.now() + expiresInMinutes * 60_000);
    const accessToken = await this.jwt.signAsync(
      {
        typ: 'api_client',
        sub: `client:${client.id}`,
        clientId: client.clientId,
        userId: client.userId,
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

    return {
      token_type: 'Bearer',
      access_token: accessToken,
      expires_in: expiresInMinutes * 60,
      expires_at: expiresAt.toISOString(),
      scopes,
    };
  }

  ownerHasActiveSubscription(user: {
    role: string;
    isActive: boolean;
    subscriptionStatus: string;
    subscriptionEndsAt: Date | null;
  }): boolean {
    if (isStaffRole(user.role) || user.role === UserRole.SuperAdmin) {
      return true;
    }
    if (!user.isActive) {
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

  private async issueUserSession(user: {
    id: number;
    email: string;
    name: string;
    role: string;
  }): Promise<AuthSession> {
    const accessTtlMin = this.config.get<number>('JWT_ACCESS_TTL', 15);
    const refreshTtlDays = this.config.get<number>('JWT_REFRESH_TTL', 30);

    const accessToken = await this.jwt.signAsync(
      {
        typ: 'user',
        sub: `user:${user.id}`,
        userId: user.id,
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

    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: accessTtlMin * 60,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    };
  }
}
