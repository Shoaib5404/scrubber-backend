import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { StorageModule } from '../../adapters/storage/storage.module';
import { loadEnvFrom } from '../../config';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { TenantModule } from '../../common/tenant/tenant.module';
import { AuditModule } from '../audit/audit.module';
import { LookupCacheModule } from '../cache/lookup-cache.module';
import { ImportsModule } from '../imports/imports.module';
import { MailModule } from '../mail/mail.module';
import { OpsCliModule } from '../ops-cli/ops-cli.module';

/**
 * CLI entry graph. Mirrors AppModule globals that OpsCliModule → BatchesModule
 * → AuthModule → TenantsModule need (MailService, TenantContext, AuditService).
 * ThrottlerModule is required because AuthModule registers ThrottlerGuard as
 * APP_GUARD. StorageModule is required by BatchIngestService.
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
    TenantModule,
    MailModule,
    AuditModule,
    StorageModule,
    PrismaModule,
    LookupCacheModule,
    ImportsModule,
    OpsCliModule,
  ],
})
export class CliModule {}
