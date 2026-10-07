import { Module } from '@nestjs/common';
import { LookupCacheModule } from '../cache/lookup-cache.module';
import { ClaimValidationService } from './claim-validation.service';
import { ClaimRuleLookupService } from './support/claim-rule-lookup.service';

@Module({
  imports: [LookupCacheModule],
  providers: [ClaimValidationService, ClaimRuleLookupService],
  exports: [ClaimValidationService],
})
export class ClaimValidationModule {}
