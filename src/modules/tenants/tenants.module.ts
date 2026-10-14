import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TenantActivityService } from './tenant-activity.service';
import { TenantFeaturesModule } from './tenant-features.module';
import { TenantInviteService } from './tenant-invite.service';
import { TenantMembersController } from './tenant-members.controller';
import { TenantOverviewController } from './tenant-overview.controller';

@Module({
  imports: [forwardRef(() => AuthModule), TenantFeaturesModule],
  controllers: [TenantMembersController, TenantOverviewController],
  providers: [TenantInviteService, TenantActivityService],
  exports: [TenantInviteService, TenantFeaturesModule, TenantActivityService],
})
export class TenantsModule {}
