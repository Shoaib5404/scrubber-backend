import { Module } from '@nestjs/common';
import { LookupCacheModule } from '../cache/lookup-cache.module';
import { BusinessRulesModule } from '../business-rules/business-rules.module';
import { MedicaidMemberIdFormatRepository } from '../reference-admin/medicaid/medicaid-member-id-format.repository';
import { ClaimValidationService } from './claim-validation.service';
import { ClaimRuleLookupService } from './support/claim-rule-lookup.service';

@Module({
  imports: [LookupCacheModule, BusinessRulesModule],
  providers: [
    ClaimValidationService,
    ClaimRuleLookupService,
    MedicaidMemberIdFormatRepository,
  ],
  exports: [ClaimValidationService],
})
export class ClaimValidationModule {}
