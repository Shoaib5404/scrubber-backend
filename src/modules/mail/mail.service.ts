import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { wrapTransactionalEmailHtml } from './email-layout';

export type InviteEmailPayload = {
  to: string;
  tenantName: string;
  role: string;
  inviteUrl: string;
};

export type PasswordResetEmailPayload = {
  to: string;
  resetUrl: string;
};

export type VerificationEmailPayload = {
  to: string;
  verificationUrl: string;
};

export type SendEmailResult = {
  sent: true;
  provider: 'sendgrid' | 'resend';
};

type OutboundEmail = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

type MailProvider = 'sendgrid' | 'resend';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return this.hasSendGrid() || this.hasResend();
  }

  /** Exposed for diagnostics / tests. Order matches send preference. */
  activeProviders(): MailProvider[] {
    const providers: MailProvider[] = [];
    if (this.hasSendGrid()) providers.push('sendgrid');
    if (this.hasResend()) providers.push('resend');
    return providers;
  }

  async sendInviteEmail(payload: InviteEmailPayload): Promise<SendEmailResult> {
    const subject = `You're invited to ${payload.tenantName} on Neo Scrubber`;
    const text = [
      `You have been invited to join ${payload.tenantName} as ${payload.role}.`,
      '',
      `Accept your invite and set a password:`,
      payload.inviteUrl,
      '',
      'If you did not expect this email, you can ignore it.',
    ].join('\n');
    const html = this.renderHtml(subject, `
      <p>You have been invited to join <strong>${escapeHtml(payload.tenantName)}</strong>
      as <strong>${escapeHtml(payload.role)}</strong>.</p>
      <p><a href="${escapeAttr(payload.inviteUrl)}">Accept invite and set password</a></p>
      <p>If you did not expect this email, you can ignore it.</p>
    `);

    if (this.config.get<string>('NODE_ENV') !== 'production') {
      this.logger.log(`Invite email for ${payload.to}: ${payload.inviteUrl}`);
    }

    return this.sendEmail({
      to: payload.to,
      subject,
      text,
      html,
    });
  }

  async sendPasswordResetEmail(
    payload: PasswordResetEmailPayload,
  ): Promise<SendEmailResult> {
    const subject = 'Reset your Neo Scrubber password';
    const text = [
      'We received a request to reset your password.',
      '',
      'Open this link to choose a new password:',
      payload.resetUrl,
      '',
      'If you did not request this, you can ignore this email.',
    ].join('\n');
    const html = this.renderHtml(subject, `
      <p>We received a request to reset your password.</p>
      <p><a href="${escapeAttr(payload.resetUrl)}">Reset your password</a></p>
      <p>If you did not request this, you can ignore this email.</p>
    `);
    return this.sendEmail({
      to: payload.to,
      subject,
      text,
      html,
    });
  }

  async sendVerificationEmail(
    payload: VerificationEmailPayload,
  ): Promise<SendEmailResult> {
    const subject = 'Verify your Neo Scrubber email';
    const text = [
      'Please verify your email address by opening this link:',
      payload.verificationUrl,
      '',
      'If you did not create an account, you can ignore this email.',
    ].join('\n');
    const html = this.renderHtml(subject, `
      <p>Please verify your email address.</p>
      <p><a href="${escapeAttr(payload.verificationUrl)}">Verify email</a></p>
      <p>If you did not create an account, you can ignore this email.</p>
    `);
    return this.sendEmail({
      to: payload.to,
      subject,
      text,
      html,
    });
  }

  private frontendOrigin(): string {
    return (
      this.config.get<string>('FRONTEND_URL')?.trim() || 'http://localhost:3010'
    );
  }

  private renderHtml(title: string, bodyHtml: string): string {
    return wrapTransactionalEmailHtml({
      frontendOrigin: this.frontendOrigin(),
      title,
      bodyHtml,
    });
  }

  /**
   * Provider order: SendGrid (if credentials in env) → Resend (if credentials in env).
   * Throws with a clear "Email not sent due to …" message when neither works.
   */
  private async sendEmail(email: OutboundEmail): Promise<SendEmailResult> {
    const errors: string[] = [];
    const tried: MailProvider[] = [];

    if (this.hasSendGrid()) {
      tried.push('sendgrid');
      try {
        await this.sendViaSendGrid(email);
        this.logger.log(`Email sent via sendgrid to ${email.to}`);
        return { sent: true, provider: 'sendgrid' };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push(`sendgrid: ${message}`);
        this.logger.warn(
          `SendGrid send failed for ${email.to}; falling back if Resend is configured. ${message}`,
        );
      }
    }

    if (this.hasResend()) {
      tried.push('resend');
      try {
        await this.sendViaResend(email);
        this.logger.log(`Email sent via resend to ${email.to}`);
        return { sent: true, provider: 'resend' };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push(`resend: ${message}`);
      }
    }

    if (errors.length === 0) {
      throw new Error(
        'Email not sent due to no email provider configured. ' +
          'Set SENDGRID_API_KEY and SENDGRID_FROM_EMAIL, or RESEND_API_KEY and RESEND_FROM_EMAIL.',
      );
    }

    throw new Error(
      `Email not sent due to ${errors.join('; ')}` +
        (tried.length > 0 ? ` (tried: ${tried.join(' → ')})` : ''),
    );
  }

  private hasSendGrid(): boolean {
    return Boolean(this.envValue('SENDGRID_API_KEY') && this.envValue('SENDGRID_FROM_EMAIL'));
  }

  private hasResend(): boolean {
    return Boolean(this.envValue('RESEND_API_KEY') && this.envValue('RESEND_FROM_EMAIL'));
  }

  private envValue(key: string): string | undefined {
    const raw = this.config.get<string>(key);
    if (raw == null) return undefined;
    const trimmed = raw.trim();
    if (!trimmed || trimmed === 'null' || trimmed === 'undefined') {
      return undefined;
    }
    return trimmed;
  }

  private async sendViaSendGrid(email: OutboundEmail): Promise<void> {
    const apiKey = this.envValue('SENDGRID_API_KEY')!;
    const fromEmail = this.envValue('SENDGRID_FROM_EMAIL')!;
    const fromName =
      this.envValue('SENDGRID_FROM_NAME') ||
      this.envValue('MAIL_FROM_NAME') ||
      'Scrubber';

    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: email.to }] }],
        from: { email: fromEmail, name: fromName },
        subject: email.subject,
        content: [
          { type: 'text/plain', value: email.text },
          { type: 'text/html', value: email.html },
        ],
      }),
    });

    if (!response.ok) {
      const body = await safeReadBody(response);
      throw new Error(`HTTP ${response.status}${body ? `: ${body}` : ''}`);
    }
  }

  private async sendViaResend(email: OutboundEmail): Promise<void> {
    const apiKey = this.envValue('RESEND_API_KEY')!;
    const fromEmail = this.envValue('RESEND_FROM_EMAIL')!;
    const fromName =
      this.envValue('RESEND_FROM_NAME') ||
      this.envValue('MAIL_FROM_NAME') ||
      'Scrubber';

    // Resend free/test mode (onboarding@resend.dev) only allows the account owner.
    // Redirect delivery when RESEND_SANDBOX_TO is set and differs from the intended recipient.
    const sandboxTo = this.envValue('RESEND_SANDBOX_TO')?.toLowerCase();
    const intendedTo = email.to.trim().toLowerCase();
    const deliverTo = sandboxTo && sandboxTo !== intendedTo ? sandboxTo : intendedTo;
    const redirected = deliverTo !== intendedTo;

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `${fromName} <${fromEmail}>`,
        to: [deliverTo],
        subject: email.subject,
        text: email.text,
        html: email.html,
      }),
    });

    if (!response.ok) {
      const body = await safeReadBody(response);
      throw new Error(`HTTP ${response.status}${body ? `: ${body}` : ''}`);
    }

    if (redirected) {
      this.logger.log(
        `Resend sandbox redirect: intended ${intendedTo} → delivered ${deliverTo}`,
      );
    }
  }
}

async function safeReadBody(response: Response): Promise<string> {
  try {
    const text = await response.text();
    return text.slice(0, 500);
  } catch {
    return '';
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(value: string): string {
  return escapeHtml(value).replace(/'/g, '&#39;');
}
