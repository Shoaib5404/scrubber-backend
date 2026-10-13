import { Module } from '@nestjs/common';
import { PasswordService } from '../auth/password.service';
import { ApiClientIssuerService } from '../ops-cli/api-client-issuer.service';
import { TenantFeaturesModule } from '../tenants/tenant-features.module';

/** Shared API-client issuer for CLI + staff admin HTTP. */
@Module({
  imports: [TenantFeaturesModule],
  providers: [PasswordService, ApiClientIssuerService],
  exports: [ApiClientIssuerService, PasswordService],
})
export class ApiClientsModule {}
