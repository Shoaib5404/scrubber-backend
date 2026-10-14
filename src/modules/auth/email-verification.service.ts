import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, createHmac, timingSafeEqual } from 'crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditCategoryCode } from '../audit/audit.catalog';
import { AuditService } from '../audit/audit.service';
import { MailService } from '../mail/mail.service';

const VERIFY_TTL_MINUTES = 60;

@Injectable()
export class EmailVerificationService {
  private readonly logger = new Logger(EmailVerificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
    private readonly audit: AuditService,
  ) {}

  emailHash(email: string): string {
    return createHash('sha1').update(email.trim().toLowerCase()).digest('hex');
  }

  buildSignedVerifyUrl(userId: number, email: string): string {
    const expires = Math.floor(Date.now() / 1000) + VERIFY_TTL_MINUTES * 60;
    const hash = this.emailHash(email);
    const signature = this.sign(`${userId}.${hash}.${expires}`);
    const frontend = this.config.get<string>('FRONTEND_URL', 'http://localhost:3010');
    const qs = new URLSearchParams({
      id: String(userId),
      hash,
      expires: String(expires),
      signature,
    });
    return `${frontend.replace(/\/$/, '')}/verify-email?${qs.toString()}`;
  }

  async sendVerificationNotification(userId: number): Promise<{
    success: true;
    message: string;
    verification_url?: string;
    email_warning?: string;
  }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('Unauthenticated.');
    }
    if (user.emailVerifiedAt) {
      return {
        success: true,
        message: 'Your email address is already verified.',
      };
    }

    const verificationUrl = this.buildSignedVerifyUrl(user.id, user.email);
    this.logger.log(`Email verification link for ${user.email}: ${verificationUrl}`);

    const payload: {
      success: true;
      message: string;
      verification_url?: string;
      email_warning?: string;
    } = {
      success: true,
      message: 'A new verification link has been sent.',
    };
    if (this.config.get<string>('NODE_ENV') !== 'production') {
      payload.verification_url = verificationUrl;
    }

    try {
      const sent = await this.mail.sendVerificationEmail({
        to: user.email,
        verificationUrl,
      });
      this.logger.log(
        `Verification email sent via ${sent.provider} to ${user.email}`,
      );
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Failed to send verification email to ${user.email}`,
        err instanceof Error ? err.stack : err,
      );
      if (this.config.get<string>('NODE_ENV') !== 'production') {
        payload.email_warning = detail;
        payload.message = 'Verification link created, but email was not delivered.';
      } else {
        payload.message = 'Unable to send verification email. Please try again later.';
      }
    }

    return payload;
  }

  async verifySignedLink(input: {
    id: number;
    hash: string;
    expires: number;
    signature: string;
  }): Promise<{ success: true; message: string }> {
    if (!Number.isFinite(input.expires) || input.expires * 1000 < Date.now()) {
      throw new BadRequestException('This verification link has expired.');
    }

    const expectedSig = this.sign(`${input.id}.${input.hash}.${input.expires}`);
    if (!safeEqualHex(expectedSig, input.signature)) {
      throw new BadRequestException('This verification link is invalid.');
    }

    const user = await this.prisma.user.findUnique({ where: { id: input.id } });
    if (!user) {
      throw new BadRequestException('This verification link is invalid.');
    }

    const expectedHash = this.emailHash(user.email);
    if (!safeEqualHex(expectedHash, input.hash)) {
      throw new BadRequestException('This verification link is invalid.');
    }

    if (!user.emailVerifiedAt) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { emailVerifiedAt: new Date() },
      });
    }

    this.audit.record({
      category: AuditCategoryCode.AuthEmailVerify,
      action: 'succeeded',
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
      message: 'Your email address has been verified.',
    };
  }

  private sign(payload: string): string {
    const secret = this.config.getOrThrow<string>('JWT_SECRET');
    return createHmac('sha256', secret).update(payload).digest('hex');
  }
}

function safeEqualHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
