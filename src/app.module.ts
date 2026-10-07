import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './modules/auth/auth.module';
import { BatchesModule } from './modules/batches/batches.module';
import { ClaimsModule } from './modules/claims/claims.module';
import { ClaimValidationModule } from './modules/claim-validation/claim-validation.module';
import { EdiParserModule } from './modules/edi-parser/edi-parser.module';
import { EdiStructuralValidationModule } from './modules/edi-structural-validation/edi-structural.module';
import { HealthModule } from './modules/health/health.module';
import { LookupCacheModule } from './modules/cache/lookup-cache.module';
import { QueueModule } from './modules/queue/queue.module';
import { ReferencesModule } from './modules/references/references.module';
import { StorageModule } from './adapters/storage/storage.module';
import { PrismaModule } from './common/prisma/prisma.module';
import { loadEnvFrom } from './config';

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
        limit: 120,
      },
    ]),
    PrismaModule,
    LookupCacheModule,
    StorageModule,
    AuthModule,
    EdiStructuralValidationModule,
    EdiParserModule,
    ClaimValidationModule,
    QueueModule,
    BatchesModule,
    ClaimsModule,
    ReferencesModule,
    HealthModule,
  ],
})
export class AppModule {}
