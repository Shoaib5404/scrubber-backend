import { Module } from '@nestjs/common';
import { ClaimValidationService } from './claim-validation.service';

@Module({
  providers: [ClaimValidationService],
  exports: [ClaimValidationService],
})
export class ClaimValidationModule {}
