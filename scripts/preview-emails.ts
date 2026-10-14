import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  emailButton,
  emailHeading,
  emailMessageBlock,
  emailMetaPanel,
  emailMuted,
  emailParagraph,
  wrapTransactionalEmailHtml,
} from '../src/modules/mail/email-layout';

const origin = 'http://localhost:3010';

const samples = [
  {
    name: 'invite',
    title: "You're invited",
    preheader: 'Join Riverside Medical Group',
    body: [
      emailHeading('Join your team on Neo Scrubber', 'Invitation'),
      emailParagraph(
        'You have been invited to join <strong>Riverside Medical Group</strong> as <strong>admin</strong>.',
      ),
      emailParagraph(
        'Accept the invite to create your password and start scrubbing claims with your organization.',
      ),
      emailButton(`${origin}/accept-invite?token=demo`, 'Accept invite'),
      emailMuted('If you did not expect this email, you can ignore it.'),
    ].join('\n'),
  },
  {
    name: 'demo-inquiry',
    title: '[SUP-2026-DEMO] New Request a Demo',
    preheader: 'Jane Mitchell · Demo request',
    body: [
      emailHeading('New demo request', 'Request a Demo'),
      emailParagraph(
        'A prospect submitted a demo inquiry. Reference <strong>SUP-2026-DEMO</strong>.',
      ),
      emailMetaPanel([
        { label: 'Reference', value: 'SUP-2026-DEMO' },
        { label: 'Subject', value: 'Interested in EDI scrubbing' },
        { label: 'Name', value: 'Jane Mitchell' },
        { label: 'Email', value: 'jane@example.com' },
        { label: 'Organization', value: 'Riverside Medical Group' },
        { label: 'Submitted', value: '15 Oct 2026, 02:00 am' },
      ]),
      emailMessageBlock(
        'Message',
        'We process ~2k claims/week and want a demo of validation + batch workflows.',
      ),
      emailButton(`${origin}/dashboard/inquiries/1`, 'Open in portal'),
    ].join('\n'),
  },
  {
    name: 'password-reset',
    title: 'Reset your Neo Scrubber password',
    preheader: 'Reset your Neo Scrubber password.',
    body: [
      emailHeading('Reset your password', 'Account security'),
      emailParagraph(
        'We received a request to reset the password for your Neo Scrubber account.',
      ),
      emailParagraph(
        'Use the button below to choose a new password. This link expires for your security.',
      ),
      emailButton(`${origin}/reset-password?token=demo`, 'Reset password'),
      emailMuted('If you did not request this, you can ignore this email.'),
    ].join('\n'),
  },
];

const frames = samples
  .map((s) => {
    const html = wrapTransactionalEmailHtml({
      frontendOrigin: origin,
      title: s.title,
      preheader: s.preheader,
      bodyHtml: s.body,
    });
    const srcdoc = html
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;');
    return `<div class="frame"><h2>${s.name}</h2><iframe srcdoc="${srcdoc}" style="width:100%;height:860px;border:0;background:#f0f4f5"></iframe></div>`;
  })
  .join('\n');

const page = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Neo Scrubber email previews</title>
  <style>
    body { margin: 0; background: #e5e7eb; font-family: system-ui, sans-serif; }
    .wrap { display: grid; gap: 28px; padding: 24px; max-width: 720px; margin: 0 auto; }
    .frame { background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,.08); }
    h2 { margin: 0; padding: 12px 16px; font-size: 13px; letter-spacing: .04em; text-transform: uppercase; background: #0f1c24; color: #fff; }
  </style>
</head>
<body>
  <div class="wrap">${frames}</div>
</body>
</html>`;

const out = join(process.cwd(), 'tmp-email-preview.html');
writeFileSync(out, page, 'utf8');
console.log(`Wrote ${out}`);
