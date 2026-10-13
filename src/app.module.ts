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
import { ReferenceAdminModule } from './modules/reference-admin/reference-admin.module';
import { ReferencesModule } from './modules/references/references.module';
import { StorageModule } from './adapters/storage/storage.module';
import { PrismaModule } from './common/prisma/prisma.module';
import { TenantModule } from './common/tenant/tenant.module';
import { UsersAdminModule } from './modules/users-admin/users-admin.module';
import { UploadLogsModule } from './modules/upload-logs/upload-logs.module';
import { PermissionsModule } from './modules/permissions/permissions.module';
import { IntegrationsModule } from './modules/integrations/integrations.module';
import { MailModule } from './modules/mail/mail.module';
import { TenantsModule } from './modules/tenants/tenants.module';
import { TenantsAdminModule } from './modules/tenants-admin/tenants-admin.module';
import { ServiceClientsAdminModule } from './modules/service-clients-admin/service-clients-admin.module';
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
    TenantModule,
    MailModule,
    LookupCacheModule,
    StorageModule,
    AuthModule,
    TenantsModule,
    TenantsAdminModule,
    EdiStructuralValidationModule,
    EdiParserModule,
    ClaimValidationModule,
    QueueModule,
    BatchesModule,
    ClaimsModule,
    ReferencesModule,
    ReferenceAdminModule,
    UsersAdminModule,
    ServiceClientsAdminModule,
    PermissionsModule,
    IntegrationsModule,
    UploadLogsModule,
    HealthModule,
  ],
})
export class AppModule {}


