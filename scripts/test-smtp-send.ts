/**
 * One-off SMTP smoke test via real MailService cascade (SendGrid → SMTP → Resend).
 * Usage: npx ts-node --transpile-only scripts/test-smtp-send.ts [to@email]
 */
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { loadEnvFrom } from '../src/config';
import { MailModule } from '../src/modules/mail/mail.module';
import { MailService } from '../src/modules/mail/mail.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      validate: (config) => loadEnvFrom(config),
    }),
    MailModule,
  ],
})
class MailTestModule {}

async function main() {
  const to =
    process.argv[2]?.trim() ||
    process.env.SMTP_USER ||
    'malickusman6204@gmail.com';

  const app = await NestFactory.createApplicationContext(MailTestModule, {
    logger: ['log', 'warn', 'error'],
  });
  const mail = app.get(MailService);

  console.log('Active providers:', mail.activeProviders());
  console.log('Configured:', mail.isConfigured());
  console.log(`Sending password-reset style email to ${to}…`);

  const result = await mail.sendPasswordResetEmail({
    to,
    resetUrl: 'http://localhost:3010/reset-password?token=smtp-smoke-test',
  });

  console.log('OK:', result);
  await app.close();
}

main().catch(async (err) => {
  console.error('FAILED:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
