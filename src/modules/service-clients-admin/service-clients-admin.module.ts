import { Module } from '@nestjs/common';
import { StaffOnlyGuard } from '../../common/guards/staff-only.guard';
import { ApiClientsModule } from '../api-clients/api-clients.module';
import { AuthModule } from '../auth/auth.module';
import { ServiceClientsAdminController } from './service-clients-admin.controller';
import { ServiceClientsAdminService } from './service-clients-admin.service';

@Module({
  imports: [AuthModule, ApiClientsModule],
  controllers: [ServiceClientsAdminController],
  providers: [ServiceClientsAdminService, StaffOnlyGuard],
})
export class ServiceClientsAdminModule {}
