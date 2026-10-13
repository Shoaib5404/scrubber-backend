/**
 * Standalone verify: dummy DB rows → Redis warm → assert → flush Redis + DB.
 *
 *   npx ts-node scripts/verify-lookup-cache.ts
 *   npx ts-node scripts/verify-lookup-cache.ts cpt_codes zip_codes
 *   npm run verify:lookup-cache
 */
import { Logger } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { loadEnvFrom } from '../src/config';
import { PrismaModule } from '../src/common/prisma/prisma.module';
import { LookupCacheModule } from '../src/modules/cache/lookup-cache.module';
import { LookupImportVerifyService } from '../src/modules/cache/lookup-import-verify.service';
import { Module } from '@nestjs/common';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      validate: (config) => loadEnvFrom(config),
    }),
    PrismaModule,
    LookupCacheModule,
  ],
})
class VerifyLookupCacheAppModule {}

async function main() {
  const logger = new Logger('verify-lookup-cache');
  const args = process.argv.slice(2).filter((a) => !a.startsWith('-'));
  const listOnly = process.argv.includes('--list');

  const app = await NestFactory.createApplicationContext(VerifyLookupCacheAppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const verify = app.get(LookupImportVerifyService);
    if (listOnly) {
      for (const f of verify.fixtures()) {
        logger.log(`  ${f.table}`);
      }
      return;
    }

    const tables = args.length > 0 ? args : undefined;
    logger.log(
      tables
        ? `Verifying ${tables.length} table(s): ${tables.join(', ')}`
        : `Verifying all ${verify.fixtures().length} fixture table(s)…`,
    );

    const results = await verify.verifyAll(tables);
    let failed = 0;
    for (const r of results) {
      if (r.ok) {
        logger.log(`OK  ${r.table}`);
      } else {
        failed += 1;
        logger.error(`FAIL ${r.table}: ${r.error}`);
        logger.error(`     steps: ${r.steps.join(' → ')}`);
      }
    }
    logger.log(`Done: ${results.length - failed}/${results.length} passed`);
    if (failed > 0) process.exitCode = 1;
  } finally {
    await app.close();
  }
}

void main();
