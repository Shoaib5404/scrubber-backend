import { Module, forwardRef } from '@nestjs/common';
import { BatchOwnershipGuard } from '../../common/guards/batch-ownership.guard';
import { ClaimOwnershipGuard } from '../../common/guards/claim-ownership.guard';
import { ClaimValidationModule } from '../claim-validation/claim-validation.module';
import { BatchesModule } from '../batches/batches.module';
import { QueueModule } from '../queue/queue.module';
import { ClaimsController } from './claims.controller';
import { ClaimsService } from './claims.service';

@Module({
  imports: [
    ClaimValidationModule,
    forwardRef(() => BatchesModule),
    forwardRef(() => QueueModule),
  ],
  controllers: [ClaimsController],
  providers: [ClaimsService, ClaimOwnershipGuard, BatchOwnershipGuard],
  exports: [ClaimsService],
})
export class ClaimsModule {}
