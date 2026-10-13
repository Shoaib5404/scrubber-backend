import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma/prisma.service';
import { QueueProducerService } from './queue-producer.service';

/**
 * Laravel scrubber:detect-stalled-queues —
 * log upload-error entries for batches stuck in validating past stall threshold.
 * failed_jobs sync is Laravel-DB-queue specific; BullMQ failed jobs are observed via Redis.
 */
@Injectable()
export class DetectStalledQueuesService {
  private readonly logger = new Logger(DetectStalledQueuesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly producer: QueueProducerService,
  ) {}

  /**
   * @param minutesOverride Laravel DetectStalledQueueValidations `--minutes` CLI override;
   * falls back to QUEUE_STALL_MINUTES (config/scrubber.php `queue_stall_minutes`) when omitted.
   */
  async run(minutesOverride?: number): Promise<{ checked: number; logged: number }> {
    if (!this.producer.useQueue()) {
      this.logger.log('Queue processing disabled; skipping stalled queue detection.');
      return { checked: 0, logged: 0 };
    }

    const minutes = Math.max(1, minutesOverride ?? this.config.get<number>('QUEUE_STALL_MINUTES', 10));
    const cutoff = new Date(Date.now() - minutes * 60_000);
    const pendingJobs = await this.producer.pendingJobCount();

    const stalled = await this.prisma.batchFile.findMany({
      where: {
        status: 'validating',
        updatedAt: { lte: cutoff },
        uploadedById: { not: null },
      },
      orderBy: { id: 'asc' },
    });

    let logged = 0;
    for (const batch of stalled) {
      if (!batch.uploadedById) continue;
      const message = `Claim validation has been pending in the queue for over ${minutes} minutes (batch #${batch.id}). Queue worker may not be running. Pending jobs in queue: ${pendingJobs}. Start the worker with: npm run start:worker`;

      const recent = await this.prisma.ediUploadErrorLog.findFirst({
        where: {
          batchFileId: batch.id,
          errorType: 'queue_stall',
          createdAt: { gte: cutoff },
        },
      });
      if (recent) continue;

      await this.prisma.ediUploadErrorLog.create({
        data: {
          userId: batch.uploadedById,
          tenantId: batch.tenantId,
          batchFileId: batch.id,
          originalFilename: batch.originalFilename,
          fileSize: batch.fileSize,
          source: 'cli',
          status: 'failed',
          errorType: 'queue_stall',
          errorMessage: message,
          totalClaims: batch.totalClaims,
        },
      });
      logged += 1;
      this.logger.warn(`Logged stalled queue for batch #${batch.id}`);
    }

    this.logger.log(`Checked ${stalled.length} stalled batch(es); wrote ${logged} stall upload log(s).`);
    return { checked: stalled.length, logged };
  }
}
