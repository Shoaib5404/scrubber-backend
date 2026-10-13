import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TenantFeaturesModule } from './tenant-features.module';
import { TenantInviteService } from './tenant-invite.service';
import { TenantMembersController } from './tenant-members.controller';

@Module({
  imports: [forwardRef(() => AuthModule), TenantFeaturesModule],
  controllers: [TenantMembersController],
  providers: [TenantInviteService],
  exports: [TenantInviteService, TenantFeaturesModule],
})
export class TenantsModule {}
