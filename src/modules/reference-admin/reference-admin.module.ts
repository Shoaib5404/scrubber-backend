import { Module } from '@nestjs/common';
import { StaffOnlyGuard } from '../../common/guards/staff-only.guard';
import { LookupCacheModule } from '../cache/lookup-cache.module';
import { ReferenceAdminController } from './reference-admin.controller';
import { ReferenceAdminService } from './reference-admin.service';

@Module({
  imports: [LookupCacheModule],
  controllers: [ReferenceAdminController],
  providers: [ReferenceAdminService, StaffOnlyGuard],
})
export class ReferenceAdminModule {}
