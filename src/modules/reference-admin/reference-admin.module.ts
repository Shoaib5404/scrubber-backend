import { Module } from '@nestjs/common';
import { StaffOnlyGuard } from '../../common/guards/staff-only.guard';
import { LookupCacheModule } from '../cache/lookup-cache.module';
import { MedicaidMemberIdFormatRepository } from './medicaid/medicaid-member-id-format.repository';
import { ReferenceAdminController } from './reference-admin.controller';
import { ReferenceAdminService } from './reference-admin.service';

@Module({
  imports: [LookupCacheModule],
  controllers: [ReferenceAdminController],
  providers: [ReferenceAdminService, MedicaidMemberIdFormatRepository, StaffOnlyGuard],
})
export class ReferenceAdminModule {}
