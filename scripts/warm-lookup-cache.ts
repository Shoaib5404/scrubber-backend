/**
 * Eagerly warm all registered lookup tables (+ nccis) into Redis DB 1.
 *
 *   npx ts-node --transpile-only scripts/warm-lookup-cache.ts
 *   npx ts-node --transpile-only scripts/warm-lookup-cache.ts cpt_codes zip_codes
 */
import { Logger, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { loadEnvFrom } from '../src/config';
import { PrismaModule } from '../src/common/prisma/prisma.module';
import { LookupCacheModule } from '../src/modules/cache/lookup-cache.module';
import { LookupWarmService } from '../src/modules/cache/lookup-warm.service';
import { LOOKUP_CACHE_TABLE_NAMES } from '../src/modules/cache/lookup-table.registry';

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
class WarmLookupCacheAppModule {}

async function main() {
  const logger = new Logger('warm-lookup-cache');
  const args = process.argv.slice(2).filter((a) => !a.startsWith('-'));

  const app = await NestFactory.createApplicationContext(WarmLookupCacheAppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const warm = app.get(LookupWarmService);
    const tables =
      args.length > 0 ? args : [...LOOKUP_CACHE_TABLE_NAMES, 'nccis'];

    logger.log(`Warming ${tables.length} table(s) into Redis DB 1…`);
    const results = await warm.warmMany(tables);
    let failed = 0;
    for (const r of results) {
      if (r.ok) {
        logger.log(`OK  ${r.table}: ${r.detail}`);
      } else {
        failed += 1;
        logger.error(`FAIL ${r.table}: ${r.detail}`);
      }
    }
    logger.log(`Done: ${results.length - failed}/${results.length} warmed`);
    if (failed > 0) process.exitCode = 1;
  } finally {
    await app.close();
  }
}

void main();
