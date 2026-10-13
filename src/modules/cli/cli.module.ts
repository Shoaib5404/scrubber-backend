import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { StorageModule } from '../../adapters/storage/storage.module';
import { loadEnvFrom } from '../../config';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { LookupCacheModule } from '../cache/lookup-cache.module';
import { ImportsModule } from '../imports/imports.module';
import { OpsCliModule } from '../ops-cli/ops-cli.module';

/**
 * CLI entry graph. OpsCliModule → BatchesModule → AuthModule registers
 * ThrottlerGuard as APP_GUARD, so ThrottlerModule must be present here
 * (same as AppModule). StorageModule is required by BatchIngestService.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      validate: (config) => loadEnvFrom(config),
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: 10_000,
      },
    ]),
    StorageModule,
    PrismaModule,
    LookupCacheModule,
    ImportsModule,
    OpsCliModule,
  ],
})
export class CliModule {}
