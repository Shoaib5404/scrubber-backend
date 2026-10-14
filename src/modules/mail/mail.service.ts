import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFileSync } from 'node:fs';
import { brandAssetPath } from '../../brand/assets';
import {
  EMAIL_LOGO_CID,
  emailButton,
  emailHeading,
  emailMessageBlock,
  emailMetaPanel,
  emailMuted,
  emailParagraph,
  escapeHtml,
  wrapTransactionalEmailHtml,
} from './email-layout';

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

export type DemoInquiryAlertPayload = {
  to: string;
  reference: string;
  categoryLabel: string;
  subject: string;
  requesterName: string;
  requesterEmail: string;
  organization: string | null;
  message: string;
  portalUrl: string;
  submittedAt: string;
};

export type InquiryReplyEmailPayload = {
  to: string;
  requesterName: string;
  reference: string;
  ticketSubject: string;
  replyBody: string;
  /** Portal deep link when the requester has an account; omit for public leads. */
  viewUrl?: string | null;
};

export type SendEmailResult = {
  sent: true;
  provider: 'sendgrid' | 'resend';
};

type InlineAttachment = {
  filename: string;
  contentType: string;
  contentId: string;
  /** Raw binary (base64-encoded at the provider boundary). */
  content: Buffer;
};

type OutboundEmail = {
  to: string;
  subject: string;
  text: string;
  html: string;
  inlineAttachments?: InlineAttachment[];
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
    const html = this.renderHtml(
      subject,
      [
        emailHeading('Join your team on Neo Scrubber', 'Invitation'),
        emailParagraph(
          `You have been invited to join <strong>${escapeHtml(payload.tenantName)}</strong> as <strong>${escapeHtml(payload.role)}</strong>.`,
        ),
        emailParagraph(
          'Accept the invite to create your password and start scrubbing claims with your organization.',
        ),
        emailButton(payload.inviteUrl, 'Accept invite'),
        emailMuted('If you did not expect this email, you can ignore it.'),
      ].join('\n'),
      `Join ${payload.tenantName} as ${payload.role} on Neo Scrubber.`,
    );

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
    const html = this.renderHtml(
      subject,
      [
        emailHeading('Reset your password', 'Account security'),
        emailParagraph(
          'We received a request to reset the password for your Neo Scrubber account.',
        ),
        emailParagraph(
          'Use the button below to choose a new password. This link expires for your security.',
        ),
        emailButton(payload.resetUrl, 'Reset password'),
        emailMuted('If you did not request this, you can ignore this email.'),
      ].join('\n'),
      'Reset your Neo Scrubber password.',
    );
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
    const html = this.renderHtml(
      subject,
      [
        emailHeading('Confirm your email', 'Welcome'),
        emailParagraph(
          'Thanks for joining Neo Scrubber. Confirm your email address so we can keep your account secure.',
        ),
        emailButton(payload.verificationUrl, 'Verify email'),
        emailMuted(
          'If you did not create an account, you can ignore this email.',
        ),
      ].join('\n'),
      'Verify your email to finish setting up Neo Scrubber.',
    );
    return this.sendEmail({
      to: payload.to,
      subject,
      text,
      html,
    });
  }

  /** Staff-admin-only alert when a public Request a Demo is submitted. */
  async sendDemoInquiryAlert(
    payload: DemoInquiryAlertPayload,
  ): Promise<SendEmailResult> {
    const subject = `[${payload.reference}] New ${payload.categoryLabel}`;
    const org = payload.organization?.trim() || '—';
    const summary =
      payload.message.length > 500
        ? `${payload.message.slice(0, 500)}…`
        : payload.message;
    const text = [
      `New demo / sales inquiry ${payload.reference}`,
      '',
      `Category: ${payload.categoryLabel}`,
      `Subject: ${payload.subject}`,
      `Name: ${payload.requesterName}`,
      `Email: ${payload.requesterEmail}`,
      `Organization: ${org}`,
      `Submitted: ${payload.submittedAt}`,
      '',
      'Message:',
      summary,
      '',
      `Open in portal: ${payload.portalUrl}`,
    ].join('\n');
    const html = this.renderHtml(
      subject,
      [
        emailHeading('New demo request', payload.categoryLabel),
        emailParagraph(
          `A prospect submitted a demo inquiry. Reference <strong>${escapeHtml(payload.reference)}</strong>.`,
        ),
        emailMetaPanel([
          { label: 'Reference', value: payload.reference },
          { label: 'Subject', value: payload.subject },
          { label: 'Name', value: payload.requesterName },
          { label: 'Email', value: payload.requesterEmail },
          { label: 'Organization', value: org },
          { label: 'Submitted', value: payload.submittedAt },
        ]),
        emailMessageBlock('Message', summary),
        emailButton(payload.portalUrl, 'Open in portal'),
      ].join('\n'),
      `${payload.requesterName} · ${payload.subject}`,
    );
    return this.sendEmail({
      to: payload.to,
      subject,
      text,
      html,
    });
  }

  /** Notify the inquiry requester when staff posts a reply. */
  async sendInquiryReplyEmail(
    payload: InquiryReplyEmailPayload,
  ): Promise<SendEmailResult> {
    const subject = `Re: [${payload.reference}] ${payload.ticketSubject}`;
    const greetingName = payload.requesterName.trim() || 'there';
    const textParts = [
      `Hi ${greetingName},`,
      '',
      `Our support team replied to your inquiry ${payload.reference} (${payload.ticketSubject}).`,
      '',
      'Reply:',
      payload.replyBody,
    ];
    if (payload.viewUrl) {
      textParts.push('', `View the conversation: ${payload.viewUrl}`);
    }
    textParts.push(
      '',
      'Thank you,',
      'Neo Scrubber Support',
    );

    const htmlParts = [
      emailHeading('You have a new reply', 'Support'),
      emailParagraph(
        `Hi ${escapeHtml(greetingName)}, our team responded to your inquiry <strong>${escapeHtml(payload.reference)}</strong>.`,
      ),
      emailMetaPanel([
        { label: 'Reference', value: payload.reference },
        { label: 'Subject', value: payload.ticketSubject },
      ]),
      emailMessageBlock('Reply from Neo Scrubber', payload.replyBody),
    ];
    if (payload.viewUrl) {
      htmlParts.push(emailButton(payload.viewUrl, 'View conversation'));
    } else {
      htmlParts.push(
        emailMuted(
          'You can reply to this email thread by contacting us again through our website, or wait for a follow-up from our team.',
        ),
      );
    }
    htmlParts.push(
      emailMuted('Thank you for contacting Neo Scrubber.'),
    );

    const html = this.renderHtml(
      subject,
      htmlParts.join('\n'),
      `Reply on ${payload.reference}: ${payload.ticketSubject}`,
    );

    return this.sendEmail({
      to: payload.to,
      subject,
      text: textParts.join('\n'),
      html,
    });
  }

  private frontendOrigin(): string {
    return (
      this.config.get<string>('FRONTEND_URL')?.trim() || 'http://localhost:3010'
    );
  }

  private renderHtml(
    title: string,
    bodyHtml: string,
    preheader?: string,
  ): string {
    const logo = this.loadInlineLogo();
    return wrapTransactionalEmailHtml({
      frontendOrigin: this.frontendOrigin(),
      title,
      preheader,
      bodyHtml,
      // Prefer CID so the mark travels with the message (works with localhost FRONTEND_URL).
      logoSrc: logo ? `cid:${EMAIL_LOGO_CID}` : undefined,
    });
  }

  private loadInlineLogo(): InlineAttachment | null {
    try {
      const content = readFileSync(brandAssetPath('logo'));
      return {
        filename: 'logo.png',
        contentType: 'image/png',
        contentId: EMAIL_LOGO_CID,
        content,
      };
    } catch (err) {
      this.logger.warn(
        `Brand logo missing for email embed (${brandAssetPath('logo')}): ${String(err)}`,
      );
      return null;
    }
  }

  /**
   * Provider order: SendGrid (if credentials in env) → Resend (if credentials in env).
   * Throws with a clear "Email not sent due to …" message when neither works.
   */
  private async sendEmail(
    email: Omit<OutboundEmail, 'inlineAttachments'> & {
      inlineAttachments?: InlineAttachment[];
    },
  ): Promise<SendEmailResult> {
    const logo = this.loadInlineLogo();
    const outbound: OutboundEmail = {
      ...email,
      inlineAttachments: logo
        ? [logo, ...(email.inlineAttachments ?? [])]
        : email.inlineAttachments,
    };

    const errors: string[] = [];
    const tried: MailProvider[] = [];

    if (this.hasSendGrid()) {
      tried.push('sendgrid');
      try {
        await this.sendViaSendGrid(outbound);
        this.logger.log(`Email sent via sendgrid to ${outbound.to}`);
        return { sent: true, provider: 'sendgrid' };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push(`sendgrid: ${message}`);
        this.logger.warn(
          `SendGrid send failed for ${outbound.to}; falling back if Resend is configured. ${message}`,
        );
      }
    }

    if (this.hasResend()) {
      tried.push('resend');
      try {
        await this.sendViaResend(outbound);
        this.logger.log(`Email sent via resend to ${outbound.to}`);
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

    const attachments = (email.inlineAttachments ?? []).map((a) => ({
      content: a.content.toString('base64'),
      type: a.contentType,
      filename: a.filename,
      disposition: 'inline',
      content_id: a.contentId,
    }));

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
        ...(attachments.length > 0 ? { attachments } : {}),
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

    const attachments = (email.inlineAttachments ?? []).map((a) => ({
      filename: a.filename,
      content: a.content.toString('base64'),
      contentId: a.contentId,
      contentType: a.contentType,
    }));

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
        ...(attachments.length > 0 ? { attachments } : {}),
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
