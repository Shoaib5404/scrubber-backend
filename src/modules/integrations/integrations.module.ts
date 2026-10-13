import { Module } from '@nestjs/common';
import { ApiClientsModule } from '../api-clients/api-clients.module';
import { TenantFeaturesModule } from '../tenants/tenant-features.module';
import { IntegrationsController } from './integrations.controller';
import { IntegrationsService } from './integrations.service';

@Module({
  imports: [ApiClientsModule, TenantFeaturesModule],
  controllers: [IntegrationsController],
  providers: [IntegrationsService],
})
export class IntegrationsModule {}
