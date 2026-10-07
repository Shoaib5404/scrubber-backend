import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, Worker } from 'bullmq';
import {
  ALL_QUEUE_NAMES,
  FinalizeBatchJobData,
  ProcessBatchFileJobData,
  QUEUE_NAMES,
  ValidateBatchJobData,
  ValidateClaimJobData,
} from './queue.constants';
import { createBullRedisConnection } from './redis.connection';
import { FinalizeBatchValidationProcessor } from './processors/finalize-batch.processor';
import { ProcessBatchFileProcessor } from './processors/process-batch-file.processor';
import { ValidateBatchProcessor } from './processors/validate-batch.processor';
import { ValidateClaimProcessor } from './processors/validate-claim.processor';

@Injectable()
export class QueueWorkerHost implements OnModuleDestroy {
  private readonly logger = new Logger(QueueWorkerHost.name);
  private readonly connection;
  private readonly workers: Worker[] = [];

  constructor(
    private readonly config: ConfigService,
    private readonly validateClaim: ValidateClaimProcessor,
    private readonly validateBatch: ValidateBatchProcessor,
    private readonly finalizeBatch: FinalizeBatchValidationProcessor,
    private readonly processBatch: ProcessBatchFileProcessor,
  ) {
    this.connection = createBullRedisConnection(config);
  }

  async start(): Promise<void> {
    const concurrency = this.config.get<number>('BULLMQ_CONCURRENCY', 5);
    for (const name of ALL_QUEUE_NAMES) {
      const worker = new Worker(name, (job) => this.dispatch(job), {
        connection: this.connection,
        concurrency,
      });
      worker.on('failed', (job, err) => {
        this.logger.error(`Job failed queue=${name} id=${job?.id}: ${err.message}`);
      });
      worker.on('completed', (job) => {
        this.logger.debug(`Job completed queue=${name} id=${job.id}`);
      });
      this.workers.push(worker);
    }
    this.logger.log(`BullMQ workers started for ${ALL_QUEUE_NAMES.length} queues (concurrency=${concurrency})`);
  }

  async onModuleDestroy() {
    await Promise.all(this.workers.map((w) => w.close()));
    this.connection.disconnect();
  }

  private async dispatch(job: Job): Promise<void> {
    const name = job.queueName as (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];
    switch (name) {
      case QUEUE_NAMES.VALIDATE_CLAIM:
        return this.validateClaim.handle(job.data as ValidateClaimJobData);
      case QUEUE_NAMES.VALIDATE_BATCH:
        return this.validateBatch.handle(job.data as ValidateBatchJobData);
      case QUEUE_NAMES.FINALIZE_BATCH_VALIDATION:
        return this.finalizeBatch.handle(job.data as FinalizeBatchJobData);
      case QUEUE_NAMES.PROCESS_BATCH_FILE:
        return this.processBatch.handle(job.data as ProcessBatchFileJobData);
      default: {
        const _exhaustive: never = name;
        throw new Error(`Unhandled queue: ${String(_exhaustive)}`);
      }
    }
  }
}
