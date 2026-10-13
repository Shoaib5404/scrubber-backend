import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PasswordService } from './password.service';

@Injectable()
export class PasswordConfirmService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Confirm password for sensitive actions.
   * Returns a short-lived confirmation token (JWT) instead of a server session.
   */
  async confirm(userId: number, password: string): Promise<{
    success: true;
    message: string;
    password_confirmed_token: string;
    expires_in: number;
    password_confirmed_at: string;
  }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !(await this.passwords.verifyPassword(password, user.password))) {
      throw new UnauthorizedException('The provided password was incorrect.');
    }

    const expiresIn = this.config.get<number>('PASSWORD_CONFIRM_TTL_SECONDS', 900);
    const passwordConfirmedAt = new Date();
    const token = await this.jwt.signAsync(
      {
        typ: 'password_confirmed',
        sub: `user:${user.id}`,
        userId: user.id,
      },
      {
        secret: this.config.getOrThrow<string>('JWT_SECRET'),
        expiresIn: `${expiresIn}s`,
        issuer: this.config.get<string>('JWT_ISSUER', 'neo-scrubber'),
        audience: this.config.get<string>('JWT_AUDIENCE', 'neo-scrubber-api'),
      },
    );

    return {
      success: true,
      message: 'Password confirmed.',
      password_confirmed_token: token,
      expires_in: expiresIn,
      password_confirmed_at: passwordConfirmedAt.toISOString(),
    };
  }

  async assertConfirmed(token: string | undefined, userId: number): Promise<void> {
    if (!token) {
      throw new UnauthorizedException('Password confirmation required.');
    }
    try {
      const payload = await this.jwt.verifyAsync<{
        typ?: string;
        userId?: number;
      }>(token, {
        secret: this.config.getOrThrow<string>('JWT_SECRET'),
        issuer: this.config.get<string>('JWT_ISSUER', 'neo-scrubber'),
        audience: this.config.get<string>('JWT_AUDIENCE', 'neo-scrubber-api'),
      });
      if (payload.typ !== 'password_confirmed' || payload.userId !== userId) {
        throw new UnauthorizedException('Password confirmation required.');
      }
    } catch {
      throw new UnauthorizedException('Password confirmation required.');
    }
  }
}
