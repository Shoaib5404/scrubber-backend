import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FlowProducer, JobsOptions, Queue } from 'bullmq';
import {
  ALL_QUEUE_NAMES,
  DEFAULT_BACKOFF,
  DEFAULT_JOB_ATTEMPTS,
  FinalizeBatchJobData,
  ProcessBatchFileJobData,
  QUEUE_NAMES,
  ValidateBatchJobData,
  ValidateClaimJobData,
  finalizeBatchJobId,
  processBatchFileJobId,
  validateBatchJobId,
  validateClaimJobId,
} from './queue.constants';
import { createBullRedisConnection } from './redis.connection';

@Injectable()
export class QueueProducerService implements OnModuleDestroy {
  private readonly logger = new Logger(QueueProducerService.name);
  private readonly connection;
  private readonly queues = new Map<string, Queue>();
  private readonly flow: FlowProducer;

  constructor(private readonly config: ConfigService) {
    this.connection = createBullRedisConnection(config);
    for (const name of ALL_QUEUE_NAMES) {
      this.queues.set(name, new Queue(name, { connection: this.connection }));
    }
    this.flow = new FlowProducer({ connection: this.connection });
  }

  async onModuleDestroy() {
    await Promise.all([...this.queues.values()].map((q) => q.close()));
    await this.flow.close();
    this.connection.disconnect();
  }

  useQueue(): boolean {
    return this.config.get<boolean>('USE_QUEUE', false);
  }

  async enqueueValidateClaim(claimId: number, force = false) {
    const data: ValidateClaimJobData = { claimId, force };
    return this.add(QUEUE_NAMES.VALIDATE_CLAIM, data, {
      jobId: validateClaimJobId(claimId),
    });
  }

  async enqueueValidateBatch(batchId: number, force = false) {
    const data: ValidateBatchJobData = { batchId, force };
    return this.add(QUEUE_NAMES.VALIDATE_BATCH, data, {
      jobId: validateBatchJobId(batchId, force),
    });
  }

  async enqueueFinalizeBatch(batchId: number) {
    const data: FinalizeBatchJobData = { batchId };
    return this.add(QUEUE_NAMES.FINALIZE_BATCH_VALIDATION, data, {
      jobId: finalizeBatchJobId(batchId),
    });
  }

  async enqueueProcessBatchFile(batchId: number, force = false) {
    const data: ProcessBatchFileJobData = { batchId, force };
    return this.add(QUEUE_NAMES.PROCESS_BATCH_FILE, data, {
      jobId: processBatchFileJobId(batchId, force),
    });
  }

  /**
   * Laravel Bus::batch(ValidateClaimJob[])->finally(FinalizeBatchValidationJob).
   * Children run first; parent finalize runs after all children complete (allowFailures).
   */
  async enqueueClaimValidationFlow(batchId: number, claimIds: number[], force: boolean) {
    if (claimIds.length === 0) {
      return this.enqueueFinalizeBatch(batchId);
    }

    const children = claimIds.map((claimId) => ({
      name: QUEUE_NAMES.VALIDATE_CLAIM,
      queueName: QUEUE_NAMES.VALIDATE_CLAIM,
      data: { claimId, force } satisfies ValidateClaimJobData,
      opts: {
        jobId: validateClaimJobId(claimId),
        attempts: DEFAULT_JOB_ATTEMPTS,
        backoff: DEFAULT_BACKOFF,
        removeOnComplete: 1000,
        removeOnFail: 5000,
      },
    }));

    const flow = await this.flow.add({
      name: QUEUE_NAMES.FINALIZE_BATCH_VALIDATION,
      queueName: QUEUE_NAMES.FINALIZE_BATCH_VALIDATION,
      data: { batchId } satisfies FinalizeBatchJobData,
      opts: {
        jobId: finalizeBatchJobId(batchId),
        attempts: DEFAULT_JOB_ATTEMPTS,
        backoff: DEFAULT_BACKOFF,
        removeOnComplete: 1000,
        removeOnFail: 5000,
      },
      children,
    });

    this.logger.log(
      `Enqueued claim validation flow batch=${batchId} claims=${claimIds.length} force=${force}`,
    );
    return flow;
  }

  async pendingJobCount(): Promise<number> {
    let total = 0;
    for (const q of this.queues.values()) {
      const counts = await q.getJobCounts('waiting', 'active', 'delayed', 'paused');
      total += counts.waiting + counts.active + counts.delayed + counts.paused;
    }
    return total;
  }

  private async add(queueName: string, data: unknown, opts: JobsOptions) {
    const queue = this.queues.get(queueName);
    if (!queue) throw new Error(`Unknown queue ${queueName}`);
    try {
      return await queue.add(queueName, data, {
        attempts: DEFAULT_JOB_ATTEMPTS,
        backoff: DEFAULT_BACKOFF,
        removeOnComplete: 1000,
        removeOnFail: 5000,
        ...opts,
      });
    } catch (err) {
      // Duplicate jobId while prior job unfinished — treat as idempotent enqueue.
      const message = err instanceof Error ? err.message : String(err);
      if (/Job .* already exists|already exists/i.test(message)) {
        this.logger.debug(`Job already queued on ${queueName}: ${opts.jobId}`);
        return null;
      }
      throw err;
    }
  }
}
