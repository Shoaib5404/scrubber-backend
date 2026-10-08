import { Module } from '@nestjs/common';
import { StaffOnlyGuard } from '../../common/guards/staff-only.guard';
import { LookupCacheModule } from '../cache/lookup-cache.module';
import { ImportsModule } from '../imports/imports.module';
import { MedicaidMemberIdFormatRepository } from './medicaid/medicaid-member-id-format.repository';
import { CmsRelationshipService } from './cms-relationship.service';
import { ReferenceAdminController } from './reference-admin.controller';
import { ReferenceAdminIoService } from './reference-admin-io.service';
import { ReferenceAdminService } from './reference-admin.service';

@Module({
  imports: [LookupCacheModule, ImportsModule],
  controllers: [ReferenceAdminController],
  providers: [
    ReferenceAdminService,
    ReferenceAdminIoService,
    CmsRelationshipService,
    MedicaidMemberIdFormatRepository,
    StaffOnlyGuard,
  ],
})
export class ReferenceAdminModule {}
