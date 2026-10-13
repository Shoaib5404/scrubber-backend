import { Module } from '@nestjs/common';
import { StaffOnlyGuard } from '../../common/guards/staff-only.guard';
import { AuthModule } from '../auth/auth.module';
import { TenantFeaturesModule } from '../tenants/tenant-features.module';
import { TenantsModule } from '../tenants/tenants.module';
import { TenantsAdminController } from './tenants-admin.controller';
import { TenantsAdminService } from './tenants-admin.service';

@Module({
  imports: [AuthModule, TenantsModule, TenantFeaturesModule],
  controllers: [TenantsAdminController],
  providers: [TenantsAdminService, StaffOnlyGuard],
})
export class TenantsAdminModule {}
