import { Logger } from '@nestjs/common';
import { Command, CommandRunner, Option } from 'nest-commander';
import { PrismaService } from '../../common/prisma/prisma.service';
import { QueueProducerService } from '../queue/queue-producer.service';

interface StatusCheckOptions {
  claims?: boolean;
}

/**
 * Laravel `App\Console\Commands\CheckStatus` (`status:check {--claims}`).
 *
 * Nest deviation: there is no `jobs`/`failed_jobs` SQL table (BullMQ keeps queue state in
 * Redis). "Pending jobs" reports `QueueProducerService.pendingJobCount()` (waiting + active +
 * delayed + paused across all queues); "failed jobs" is reported as N/A with a pointer to
 * Redis/BullMQ instead of a fabricated count.
 */
@Command({
  name: 'status:check',
  description: 'Check system status (queue + batches, optionally claim status breakdown)',
})
export class StatusCheckCommand extends CommandRunner {
  private readonly logger = new Logger(StatusCheckCommand.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly queueProducer: QueueProducerService,
  ) {
    super();
  }

  async run(_passedParams: string[], options: StatusCheckOptions): Promise<void> {
    this.logger.log('=== QUEUE STATUS ===');
    const pending = await this.queueProducer.pendingJobCount();
    this.logger.log(`Pending jobs (BullMQ waiting+active+delayed+paused): ${pending}`);
    this.logger.log('Failed jobs: N/A (no failed_jobs table — see BullMQ failed state in Redis)');

    this.logger.log('');
    this.logger.log('=== BATCHES ===');
    const batches = await this.prisma.batchFile.findMany({ orderBy: { id: 'asc' } });
    if (batches.length === 0) {
      this.logger.warn('No batches found');
    } else {
      for (const batch of batches) {
        const filename =
          batch.originalFilename.length > 30
            ? batch.originalFilename.slice(0, 30)
            : batch.originalFilename;
        this.logger.log(
          `#${batch.id}  status=${batch.status}  claims=${batch.totalClaims}  valid=${batch.validClaims}  error=${batch.errorClaims}  warning=${batch.warningClaims}  file=${filename}`,
        );
      }
    }

    if (options.claims) {
      this.logger.log('');
      this.logger.log('=== CLAIM STATUS BREAKDOWN ===');
      const grouped = await this.prisma.claim.groupBy({
        by: ['status'],
        _count: { _all: true },
      });
      if (grouped.length === 0) {
        this.logger.log('No claims found');
      }
      for (const row of grouped) {
        this.logger.log(`${row.status}: ${row._count._all}`);
      }
    }
  }

  @Option({
    flags: '--claims',
    description: 'Show claim status breakdown',
  })
  parseClaims(): boolean {
    return true;
  }
}
