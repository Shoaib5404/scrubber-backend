import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { AuthPrincipal } from '../auth.types';

type JwtPayload = {
  typ: 'user' | 'api_client';
  sub: string;
  userId?: number | null;
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
      });
      if (!client || !client.isActive) {
        throw new UnauthorizedException('Invalid API client token.');
      }
      return {
        typ: 'api_client',
        userId: client.userId,
        role: null,
        clientId: client.clientId,
        scopes: payload.scopes ?? [],
      };
    }

    if (payload.typ === 'user' && payload.userId) {
      const user = await this.prisma.user.findUnique({ where: { id: payload.userId } });
      if (!user || !user.isActive) {
        throw new UnauthorizedException('Invalid user token.');
      }
      return {
        typ: 'user',
        userId: user.id,
        role: user.role,
        email: user.email,
        scopes: [],
      };
    }

    throw new UnauthorizedException('Invalid token.');
  }
}
