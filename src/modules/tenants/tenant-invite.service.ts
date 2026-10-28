import {
  BadRequestException,
  Injectable,
  Logger,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditCategoryCode } from '../audit/audit.catalog';
import { AuditService } from '../audit/audit.service';
import { UserRole } from '../auth/auth.constants';
import { PasswordService } from '../auth/password.service';
import { MailService } from '../mail/mail.service';

const INVITE_ROLES = new Set<string>([UserRole.TenantAdmin, UserRole.Customer]);

@Injectable()
export class TenantInviteService {
  private readonly logger = new Logger(TenantInviteService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  async inviteUser(input: {
    tenantId: number;
    email: string;
    name: string;
    role: string;
    invitedByUserId: number | null;
  }): Promise<{
    user: { id: number; email: string; name: string; role: string; is_active: boolean };
    invite_url?: string;
    email_warning?: string;
  }> {
    const email = input.email.trim().toLowerCase();
    const role = input.role;
    if (!INVITE_ROLES.has(role)) {
      throw new BadRequestException('Invite role must be tenant_admin or customer.');
    }

    const tenant = await this.prisma.tenant.findUnique({ where: { id: input.tenantId } });
    if (!tenant) {
      throw new BadRequestException('Tenant not found.');
    }
    if (tenant.status === 'suspended') {
      throw new UnprocessableEntityException('Cannot invite users to a suspended tenant.');
    }

    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      if (existing.tenantId != null && existing.tenantId !== input.tenantId) {
        throw new UnprocessableEntityException('Email already belongs to another organization.');
      }
      if (existing.isActive && existing.tenantId === input.tenantId) {
        throw new UnprocessableEntityException('User is already an active member of this tenant.');
      }
    }

    const placeholderPassword = await this.passwords.hashPassword(
      randomBytes(32).toString('hex'),
    );

    const user =
      existing ??
      (await this.prisma.user.create({
        data: {
          email,
          name: input.name.trim() || email.split('@')[0] || 'User',
          password: placeholderPassword,
          role,
          tenantId: input.tenantId,
          isActive: false,
          subscriptionStatus: tenant.subscriptionStatus,
          subscriptionStartsAt: tenant.subscriptionStartsAt,
          subscriptionEndsAt: tenant.subscriptionEndsAt,
        },
      }));

    if (existing) {
      await this.prisma.user.update({
        where: { id: existing.id },
        data: {
          name: input.name.trim() || existing.name,
          role,
          tenantId: input.tenantId,
          isActive: false,
          password: placeholderPassword,
        },
      });
    }

    const { rawToken, inviteUrl } = await this.createInviteToken({
      tenantId: input.tenantId,
      email,
      role,
      invitedByUserId: input.invitedByUserId,
    });

    const payload: {
      user: { id: number; email: string; name: string; role: string; is_active: boolean };
      invite_url?: string;
      email_warning?: string;
    } = {
      user: {
        id: user.id,
        email,
        name: input.name.trim() || user.name,
        role,
        is_active: false,
      },
    };

    const isProd = this.config.get<string>('NODE_ENV') === 'production';
    if (!isProd) {
      payload.invite_url = inviteUrl;
      void rawToken;
    }

    try {
      const sent = await this.mail.sendInviteEmail({
        to: email,
        tenantName: tenant.name,
        role,
        inviteUrl,
      });
      await this.prisma.tenantInvite.updateMany({
        where: { tenantId: input.tenantId, email, acceptedAt: null },
        data: { emailStatus: 'sent' },
      });
      this.logger.log(`Invite email delivered via ${sent.provider} to ${email}`);
    } catch (err) {
      await this.prisma.tenantInvite.updateMany({
        where: { tenantId: input.tenantId, email, acceptedAt: null },
        data: { emailStatus: 'failed' },
      });
      const detail = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to send invite to ${email}`, err instanceof Error ? err.stack : err);

      // Non-prod: keep invite usable via invite_url so local testing is not blocked by
      // provider sandbox / SMTP recipient limits.
      if (!isProd) {
        payload.email_warning = `${detail} Open invite_url to accept, or configure SendGrid, SMTP, or a verified Resend domain.`;
        return payload;
      }

      throw new UnprocessableEntityException(
        `Invite was created but ${detail} Use resend-invite to retry.`,
      );
    }

    return payload;
  }

  async resendInvite(input: {
    tenantId: number;
    email: string;
    invitedByUserId: number | null;
  }): Promise<{ invite_url?: string; email_warning?: string }> {
    const email = input.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || user.tenantId !== input.tenantId) {
      throw new BadRequestException('No pending member found for this email.');
    }
    if (user.isActive) {
      throw new UnprocessableEntityException('User has already accepted their invite.');
    }

    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: input.tenantId },
    });

    const { inviteUrl } = await this.createInviteToken({
      tenantId: input.tenantId,
      email,
      role: user.role,
      invitedByUserId: input.invitedByUserId,
    });

    const isProd = this.config.get<string>('NODE_ENV') === 'production';
    try {
      const sent = await this.mail.sendInviteEmail({
        to: email,
        tenantName: tenant.name,
        role: user.role,
        inviteUrl,
      });
      await this.prisma.tenantInvite.updateMany({
        where: { tenantId: input.tenantId, email, acceptedAt: null },
        data: { emailStatus: 'sent' },
      });
      this.logger.log(`Invite email resent via ${sent.provider} to ${email}`);
    } catch (err) {
      await this.prisma.tenantInvite.updateMany({
        where: { tenantId: input.tenantId, email, acceptedAt: null },
        data: { emailStatus: 'failed' },
      });
      const detail = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to resend invite to ${email}`, err instanceof Error ? err.stack : err);
      if (!isProd) {
        return {
          invite_url: inviteUrl,
          email_warning: `Invite token refreshed. ${detail} Use invite_url to accept.`,
        };
      }
      throw new UnprocessableEntityException(`${detail} Try again later.`);
    }

    if (!isProd) {
      return { invite_url: inviteUrl };
    }
    return {};
  }

  async acceptInvite(input: {
    email: string;
    token: string;
    password: string;
  }): Promise<{ success: true; message: string }> {
    const email = input.email.trim().toLowerCase();
    const tokenHash = this.passwords.hashToken(input.token);

    const invite = await this.prisma.tenantInvite.findFirst({
      where: { email, tokenHash, acceptedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    if (!invite || invite.expiresAt.getTime() < Date.now()) {
      throw new UnprocessableEntityException('Invalid or expired invite token.');
    }

    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || user.tenantId !== invite.tenantId) {
      throw new UnprocessableEntityException('Invalid or expired invite token.');
    }

    const passwordHash = await this.passwords.hashPassword(input.password);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: {
          password: passwordHash,
          isActive: true,
          role: invite.role,
          emailVerifiedAt: user.emailVerifiedAt ?? new Date(),
        },
      });
      await tx.tenantInvite.update({
        where: { id: invite.id },
        data: { acceptedAt: new Date(), emailStatus: 'sent' },
      });
      await tx.tenantInvite.updateMany({
        where: {
          tenantId: invite.tenantId,
          email,
          acceptedAt: null,
          id: { not: invite.id },
        },
        data: { acceptedAt: new Date() },
      });
    });

    this.audit.record({
      category: AuditCategoryCode.AuthInviteAccept,
      action: 'succeeded',
      actorType: 'user',
      actorUserId: user.id,
      actorRole: invite.role,
      tenantId: invite.tenantId,
      system: true,
      resourceType: 'tenant_invite',
      resourceId: invite.id,
      metadata: { user_id: user.id },
    });

    return { success: true, message: 'Invite accepted. You can now sign in.' };
  }

  private async createInviteToken(input: {
    tenantId: number;
    email: string;
    role: string;
    invitedByUserId: number | null;
  }): Promise<{ rawToken: string; inviteUrl: string }> {
    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = this.passwords.hashToken(rawToken);
    const ttlDays = this.config.get<number>('TENANT_INVITE_TTL_DAYS', 7);
    const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60_000);

    await this.prisma.tenantInvite.updateMany({
      where: { tenantId: input.tenantId, email: input.email, acceptedAt: null },
      data: { acceptedAt: new Date() },
    });

    await this.prisma.tenantInvite.create({
      data: {
        tenantId: input.tenantId,
        email: input.email,
        role: input.role,
        tokenHash,
        invitedByUserId: input.invitedByUserId,
        expiresAt,
        emailStatus: 'pending',
      },
    });

    const frontend = this.config.get<string>('FRONTEND_URL', 'http://localhost:3010');
    const inviteUrl =
      `${frontend.replace(/\/$/, '')}/accept-invite` +
      `?token=${encodeURIComponent(rawToken)}&email=${encodeURIComponent(input.email)}`;

    return { rawToken, inviteUrl };
  }
}
