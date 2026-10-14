import { brandPublicUrl } from '../../brand/assets';

/** Brand tokens aligned with the portal healthcare theme. */
const EMAIL = {
  bg: '#f0f4f5',
  card: '#ffffff',
  border: '#d5dee3',
  mutedBorder: '#e8eef1',
  text: '#0f1c24',
  muted: '#5b6b75',
  subtle: '#8a9aa3',
  primary: '#0f766e',
  primarySoft: '#d9f3ef',
  primaryFg: '#f0fdfa',
  panel: '#f4f7f8',
  radius: '16px',
  font: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
} as const;

/** Content-ID used when the logo is attached inline (without angle brackets). */
export const EMAIL_LOGO_CID = 'neo-scrubber-logo';

type EmailLayoutInput = {
  frontendOrigin: string;
  title: string;
  /** Optional inbox preview text (hidden in body, shown in list view). */
  preheader?: string;
  bodyHtml: string;
  /** Footer tagline override. */
  footerNote?: string;
  /**
   * Logo `img` src. Prefer `cid:neo-scrubber-logo` when MailService attaches
   * the PNG inline; falls back to the public frontend URL for previews.
   */
  logoSrc?: string;
};

export type EmailMetaRow = {
  label: string;
  value: string;
};

/**
 * Shared HTML chrome for transactional mail — modern card layout with
 * brand wordmark. Production mail embeds the PNG as an inline CID attachment.
 */
export function wrapTransactionalEmailHtml(input: EmailLayoutInput): string {
  const logoUrl =
    input.logoSrc?.trim() || brandPublicUrl('logo', input.frontendOrigin);
  const origin = input.frontendOrigin.replace(/\/$/, '');
  const year = new Date().getFullYear();
  const preheader = input.preheader?.trim()
    ? `<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">
        ${escapeHtml(input.preheader.trim())}
      </div>`
    : '';
  const footerNote =
    input.footerNote?.trim() ||
    'EDI claim scrubbing for modern healthcare teams.';

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="light" />
  <meta name="supported-color-schemes" content="light" />
  <title>${escapeHtml(input.title)}</title>
  <!--[if mso]>
  <style type="text/css">
    body, table, td { font-family: Arial, Helvetica, sans-serif !important; }
  </style>
  <![endif]-->
</head>
<body style="margin:0;padding:0;background:${EMAIL.bg};font-family:${EMAIL.font};color:${EMAIL.text};-webkit-font-smoothing:antialiased;">
  ${preheader}
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:${EMAIL.bg};">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:580px;border-collapse:separate;">
          <!-- Brand header -->
          <tr>
            <td align="left" style="padding:0 8px 16px;">
              <a href="${escapeAttr(origin)}" style="text-decoration:none;">
                <img src="${escapeAttr(logoUrl)}" alt="Neo Scrubber" width="148" height="56" style="display:block;height:40px;width:auto;border:0;outline:none;" />
              </a>
            </td>
          </tr>
          <!-- Card -->
          <tr>
            <td style="background:${EMAIL.card};border:1px solid ${EMAIL.border};border-radius:${EMAIL.radius};overflow:hidden;box-shadow:0 8px 24px rgba(15,28,36,0.06);">
              <!-- Accent bar -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td style="height:4px;line-height:4px;font-size:0;background:linear-gradient(90deg, ${EMAIL.primary} 0%, #14b8a6 100%);background-color:${EMAIL.primary};">&nbsp;</td>
                </tr>
              </table>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td style="padding:28px 28px 8px;font-size:15px;line-height:1.6;color:${EMAIL.text};">
                    ${input.bodyHtml}
                  </td>
                </tr>
                <tr>
                  <td style="padding:20px 28px 24px;border-top:1px solid ${EMAIL.mutedBorder};">
                    <p style="margin:0;font-size:12px;line-height:1.5;color:${EMAIL.muted};">
                      ${escapeHtml(footerNote)}
                    </p>
                    <p style="margin:8px 0 0;font-size:11px;line-height:1.45;color:${EMAIL.subtle};">
                      © ${year} Neo Scrubber ·
                      <a href="${escapeAttr(origin)}" style="color:${EMAIL.primary};text-decoration:none;">Open app</a>
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Legal strip -->
          <tr>
            <td align="center" style="padding:20px 12px 0;">
              <p style="margin:0;font-size:11px;line-height:1.5;color:${EMAIL.subtle};max-width:420px;">
                This message was sent by Neo Scrubber. If you were not expecting it, you can safely ignore it.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/** Primary call-to-action button (email-client safe table + padded link). */
export function emailButton(href: string, label: string): string {
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:24px 0 8px;">
  <tr>
    <td align="center" bgcolor="${EMAIL.primary}" style="border-radius:10px;background-color:${EMAIL.primary};">
      <a href="${escapeAttr(href)}" style="display:inline-block;padding:12px 22px;font-size:14px;font-weight:600;line-height:1.25;color:${EMAIL.primaryFg};text-decoration:none;border-radius:10px;background-color:${EMAIL.primary};font-family:${EMAIL.font};">
        ${escapeHtml(label)}
      </a>
    </td>
  </tr>
</table>
<p style="margin:0 0 16px;font-size:12px;line-height:1.5;color:${EMAIL.subtle};word-break:break-all;">
  Or open this link:<br/>
  <a href="${escapeAttr(href)}" style="color:${EMAIL.primary};text-decoration:underline;">${escapeHtml(href)}</a>
</p>`;
}

export function emailHeading(title: string, eyebrow?: string): string {
  const eye = eyebrow
    ? `<p style="margin:0 0 8px;font-size:12px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;color:${EMAIL.primary};">${escapeHtml(eyebrow)}</p>`
    : '';
  return `${eye}<h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;font-weight:650;color:${EMAIL.text};letter-spacing:-0.02em;">${escapeHtml(title)}</h1>`;
}

export function emailParagraph(text: string): string {
  return `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:${EMAIL.text};">${text}</p>`;
}

export function emailMuted(text: string): string {
  return `<p style="margin:0 0 8px;font-size:13px;line-height:1.55;color:${EMAIL.muted};">${text}</p>`;
}

/** Soft panel with label/value rows (for inquiry / ticket details). */
export function emailMetaPanel(rows: EmailMetaRow[]): string {
  const cells = rows
    .map(
      (row, index) => {
        const border =
          index < rows.length - 1
            ? `border-bottom:1px solid ${EMAIL.mutedBorder};`
            : '';
        return `<tr>
  <td style="padding:10px 0;${border}vertical-align:top;width:34%;font-size:12px;font-weight:600;color:${EMAIL.muted};text-transform:uppercase;letter-spacing:0.03em;">
    ${escapeHtml(row.label)}
  </td>
  <td style="padding:10px 0;${border}vertical-align:top;font-size:14px;line-height:1.45;color:${EMAIL.text};word-break:break-word;">
    ${escapeHtml(row.value)}
  </td>
</tr>`;
      },
    )
    .join('');

  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:8px 0 20px;background:${EMAIL.panel};border:1px solid ${EMAIL.mutedBorder};border-radius:12px;">
  <tr>
    <td style="padding:4px 16px;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
        ${cells}
      </table>
    </td>
  </tr>
</table>`;
}

/** Quoted message / body block. */
export function emailMessageBlock(label: string, body: string): string {
  const htmlBody = escapeHtml(body).replace(/\n/g, '<br/>');
  return `<p style="margin:0 0 8px;font-size:12px;font-weight:600;letter-spacing:0.03em;text-transform:uppercase;color:${EMAIL.muted};">${escapeHtml(label)}</p>
<div style="margin:0 0 20px;padding:14px 16px;background:${EMAIL.primarySoft};border-left:3px solid ${EMAIL.primary};border-radius:0 10px 10px 0;font-size:14px;line-height:1.55;color:${EMAIL.text};">
  ${htmlBody}
</div>`;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function escapeAttr(value: string): string {
  return escapeHtml(value).replace(/'/g, '&#39;');
}
