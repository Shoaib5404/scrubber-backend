import { Module } from '@nestjs/common';
import { LookupCacheModule } from '../cache/lookup-cache.module';
import { MedicaidMemberIdFormatRepository } from '../reference-admin/medicaid/medicaid-member-id-format.repository';
import { ClaimValidationService } from './claim-validation.service';
import { ClaimRuleLookupService } from './support/claim-rule-lookup.service';

@Module({
  imports: [LookupCacheModule],
  providers: [
    ClaimValidationService,
    ClaimRuleLookupService,
    MedicaidMemberIdFormatRepository,
  ],
  exports: [ClaimValidationService],
})
export class ClaimValidationModule {}
