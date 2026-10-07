import { Module, forwardRef } from '@nestjs/common';
import { BatchesModule } from '../batches/batches.module';
import { ClaimValidationModule } from '../claim-validation/claim-validation.module';
import { DetectStalledQueuesService } from './detect-stalled-queues.service';
import { FinalizeBatchValidationProcessor } from './processors/finalize-batch.processor';
import { ProcessBatchFileProcessor } from './processors/process-batch-file.processor';
import { ValidateBatchProcessor } from './processors/validate-batch.processor';
import { ValidateClaimProcessor } from './processors/validate-claim.processor';
import { QueueProducerService } from './queue-producer.service';
import { QueueWorkerHost } from './queue-worker.host';
import { SchedulerHost } from './scheduler.host';

@Module({
  imports: [ClaimValidationModule, forwardRef(() => BatchesModule)],
  providers: [
    QueueProducerService,
    ValidateClaimProcessor,
    ValidateBatchProcessor,
    FinalizeBatchValidationProcessor,
    ProcessBatchFileProcessor,
    DetectStalledQueuesService,
    QueueWorkerHost,
    SchedulerHost,
  ],
  exports: [
    QueueProducerService,
    DetectStalledQueuesService,
    QueueWorkerHost,
    SchedulerHost,
    ValidateClaimProcessor,
    FinalizeBatchValidationProcessor,
  ],
})
export class QueueModule {}
