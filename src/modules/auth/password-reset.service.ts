import { Injectable, Logger, UnprocessableEntityException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditCategoryCode } from '../audit/audit.catalog';
import { AuditService } from '../audit/audit.service';
import { MailService } from '../mail/mail.service';
import { PasswordService } from './password.service';

const GENERIC_FORGOT_MESSAGE =
  'If that email address is in our system, we have sent a password reset link.';

@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly passwords: PasswordService,
    private readonly mail: MailService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Always return a generic success
   * so callers cannot probe which emails exist.
   */
  async forgotPassword(emailRaw: string): Promise<{
    success: true;
    message: string;
    reset_url?: string;
    email_warning?: string;
  }> {
    const email = emailRaw.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (!user || !user.isActive) {
      return { success: true, message: GENERIC_FORGOT_MESSAGE };
    }

    this.audit.record({
      category: AuditCategoryCode.AuthPasswordReset,
      action: 'requested',
      actorType: 'user',
      actorUserId: user.id,
      actorRole: user.role,
      tenantId: user.tenantId,
      system: true,
      resourceType: 'user',
      resourceId: user.id,
    });

    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = this.passwords.hashToken(rawToken);

    await this.prisma.passwordResetToken.upsert({
      where: { email },
      create: { email, token: tokenHash },
      update: { token: tokenHash, createdAt: new Date() },
    });

    const frontend = this.config.get<string>('FRONTEND_URL', 'http://localhost:3010');
    const resetUrl =
      `${frontend.replace(/\/$/, '')}/reset-password` +
      `?token=${encodeURIComponent(rawToken)}&email=${encodeURIComponent(email)}`;

    this.logger.log(`Password reset link for ${email}: ${resetUrl}`);

    const payload: {
      success: true;
      message: string;
      reset_url?: string;
      email_warning?: string;
    } = {
      success: true,
      message: GENERIC_FORGOT_MESSAGE,
    };

    // Local/dev aid when SMTP is not configured (never in production).
    if (this.config.get<string>('NODE_ENV') !== 'production') {
      payload.reset_url = resetUrl;
    }

    try {
      const sent = await this.mail.sendPasswordResetEmail({ to: email, resetUrl });
      this.logger.log(`Password reset email sent via ${sent.provider} to ${email}`);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Failed to send password reset email to ${email}`,
        err instanceof Error ? err.stack : err,
      );
      // Never leak existence in production; still soft-fail delivery issues.
      if (this.config.get<string>('NODE_ENV') !== 'production') {
        payload.email_warning = detail;
      }
    }

    return payload;
  }

  /** Apply a new password from a reset token. */
  async resetPassword(input: {
    email: string;
    token: string;
    password: string;
  }): Promise<{ success: true; message: string }> {
    const email = input.email.trim().toLowerCase();
    const stored = await this.prisma.passwordResetToken.findUnique({ where: { email } });
    if (!stored) {
      throw new UnprocessableEntityException('This password reset token is invalid.');
    }

    const ttlMinutes = this.config.get<number>('PASSWORD_RESET_TTL_MINUTES', 60);
    const ageMs = Date.now() - stored.createdAt.getTime();
    if (ageMs > ttlMinutes * 60_000) {
      await this.prisma.passwordResetToken.delete({ where: { email } }).catch(() => undefined);
      throw new UnprocessableEntityException('This password reset token has expired.');
    }

    const tokenHash = this.passwords.hashToken(input.token);
    if (tokenHash !== stored.token) {
      throw new UnprocessableEntityException('This password reset token is invalid.');
    }

    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !user.isActive) {
      throw new UnprocessableEntityException('This password reset token is invalid.');
    }

    const passwordHash = await this.passwords.hashPassword(input.password);

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: {
          password: passwordHash,
          rememberToken: randomBytes(30).toString('hex'),
        },
      });
      await tx.passwordResetToken.delete({ where: { email } });
      await tx.refreshToken.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });

    this.audit.record({
      category: AuditCategoryCode.AuthPasswordReset,
      action: 'completed',
      actorType: 'user',
      actorUserId: user.id,
      actorRole: user.role,
      tenantId: user.tenantId,
      system: true,
      resourceType: 'user',
      resourceId: user.id,
    });

    return {
      success: true,
      message: 'Your password has been reset. You can sign in with your new password.',
    };
  }
}
