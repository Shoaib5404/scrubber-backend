/**
 * Lean Nest context for NPI Order & Referring sync (avoids full CLI DI graph).
 *
 *   npx ts-node --transpile-only scripts/npi-ordering-referrings-sync.ts
 *   npx ts-node --transpile-only scripts/npi-ordering-referrings-sync.ts --force
 */
import { Logger, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { loadEnvFrom } from '../src/config';
import { PrismaModule } from '../src/common/prisma/prisma.module';
import { LookupCacheModule } from '../src/modules/cache/lookup-cache.module';
import { ImportsModule } from '../src/modules/imports/imports.module';
import { NpiOrderingReferringSyncService } from '../src/modules/imports/npi-ordering-referring/npi-ordering-referring-sync.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      validate: (config) => loadEnvFrom(config),
    }),
    PrismaModule,
    LookupCacheModule,
    ImportsModule,
  ],
})
class NpiSyncAppModule {}

async function main() {
  const logger = new Logger('npi-ordering-referrings-sync');
  const force = process.argv.includes('--force');
  const skipImport = process.argv.includes('--skip-import');

  const app = await NestFactory.createApplicationContext(NpiSyncAppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const sync = app.get(NpiOrderingReferringSyncService);
    logger.log(`Starting sync (force=${force}, skipImport=${skipImport})`);
    const result = await sync.run({ force, skipImport });
    if (!result.ok) {
      logger.error(result.reason ?? 'NPI sync failed');
      process.exitCode = 1;
      return;
    }
    if (result.skipped) {
      logger.log(`Skipped: ${result.reason ?? 'no changes'}`);
    } else {
      logger.log('NPI sync completed successfully');
    }
  } finally {
    await app.close();
  }
}

void main();
