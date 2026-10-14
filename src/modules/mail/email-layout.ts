import { brandPublicUrl } from '../../brand/assets';

type EmailLayoutInput = {
  frontendOrigin: string;
  title: string;
  bodyHtml: string;
};

/**
 * Shared HTML chrome for transactional mail — uses the public brand wordmark
 * hosted on the Next frontend (`/brand/logo.png`).
 */
export function wrapTransactionalEmailHtml(input: EmailLayoutInput): string {
  const logoUrl = brandPublicUrl('logo', input.frontendOrigin);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(input.title)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f7f8;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#0f1c24;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f7f8;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #d5dee3;border-radius:12px;overflow:hidden;">
          <tr>
            <td style="padding:20px 24px;border-bottom:1px solid #e8eef1;background:#ffffff;">
              <img src="${escapeAttr(logoUrl)}" alt="Neo Scrubber" width="160" height="60" style="display:block;height:48px;width:auto;border:0;" />
            </td>
          </tr>
          <tr>
            <td style="padding:24px;font-size:15px;line-height:1.55;">
              ${input.bodyHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:16px 24px;border-top:1px solid #e8eef1;font-size:12px;color:#5b6b75;">
              Neo Scrubber · EDI claim scrubbing
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
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
