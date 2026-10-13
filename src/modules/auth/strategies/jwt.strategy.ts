import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../../common/prisma/prisma.service';
import {
  ACCOUNT_DEACTIVATED_MESSAGE,
  TENANT_SUSPENDED_MESSAGE,
  isStaffRole,
} from '../auth.constants';
import { AuthService } from '../auth.service';
import { AuthPrincipal } from '../auth.types';

type JwtPayload = {
  typ: 'user' | 'api_client';
  sub: string;
  userId?: number | null;
  tenantId?: number | null;
  email?: string;
  role?: string;
  clientId?: string;
  scopes?: string[];
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
      issuer: config.get<string>('JWT_ISSUER', 'neo-scrubber'),
      audience: config.get<string>('JWT_AUDIENCE', 'neo-scrubber-api'),
    });
  }

  async validate(payload: JwtPayload): Promise<AuthPrincipal> {
    if (payload.typ === 'api_client') {
      const client = await this.prisma.apiClient.findUnique({
        where: { clientId: payload.clientId },
        include: {
          user: { include: { tenant: true } },
          tenant: true,
        },
      });
      if (!client || !client.isActive) {
        throw new UnauthorizedException('Invalid API client token.');
      }

      const tenant =
        client.tenant ??
        client.user?.tenant ??
        (client.tenantId
          ? await this.prisma.tenant.findUnique({ where: { id: client.tenantId } })
          : null);

      if (tenant?.status === 'suspended') {
        throw new ForbiddenException(TENANT_SUSPENDED_MESSAGE);
      }

      if (client.userId != null) {
        if (!client.user || !client.user.isActive) {
          throw new UnauthorizedException('The customer account is inactive.');
        }
        if (!this.auth.tenantHasActiveSubscription(tenant ?? client.user)) {
          throw new UnauthorizedException('The customer subscription is not active.');
        }
      }

      return {
        typ: 'api_client',
        userId: client.userId,
        tenantId: client.tenantId ?? client.user?.tenantId ?? null,
        role: null,
        clientId: client.clientId,
        scopes: payload.scopes ?? [],
      };
    }

    if (payload.typ === 'user' && payload.userId) {
      const user = await this.prisma.user.findUnique({
        where: { id: payload.userId },
        include: { tenant: true },
      });
      if (!user) {
        throw new UnauthorizedException('Invalid user token.');
      }
      if (!user.isActive) {
        throw new ForbiddenException(ACCOUNT_DEACTIVATED_MESSAGE);
      }
      if (user.tenant && user.tenant.status === 'suspended' && !isStaffRole(user.role)) {
        throw new ForbiddenException(TENANT_SUSPENDED_MESSAGE);
      }
      return {
        typ: 'user',
        userId: user.id,
        tenantId: user.tenantId,
        role: user.role,
        email: user.email,
        scopes: [],
      };
    }

    throw new UnauthorizedException('Invalid token.');
  }
}
