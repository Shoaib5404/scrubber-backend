import { Module } from '@nestjs/common';
import { ClaimValidationService } from './claim-validation.service';
import { ClaimRuleLookupService } from './support/claim-rule-lookup.service';

@Module({
  providers: [ClaimValidationService, ClaimRuleLookupService],
  exports: [ClaimValidationService],
})
export class ClaimValidationModule {}
