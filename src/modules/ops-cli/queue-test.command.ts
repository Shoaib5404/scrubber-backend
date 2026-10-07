import { Logger } from '@nestjs/common';
import { Command, CommandRunner } from 'nest-commander';
import { PrismaService } from '../../common/prisma/prisma.service';
import { QueueProducerService } from '../queue/queue-producer.service';

/** Laravel `App\Console\Commands\TestQueue` (`queue:test {batch_id?}`). */
@Command({
  name: 'queue:test',
  arguments: '[batch_id]',
  description: 'Test the queue by dispatching a process-batch-file job',
  argsDescription: {
    batch_id: 'Batch ID; defaults to the first pending batch',
  },
})
export class QueueTestCommand extends CommandRunner {
  private readonly logger = new Logger(QueueTestCommand.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly queueProducer: QueueProducerService,
  ) {
    super();
  }

  async run(passedParams: string[]): Promise<void> {
    let batchId = passedParams[0] ? Number(passedParams[0]) : undefined;

    if (!batchId) {
      const pending = await this.prisma.batchFile.findFirst({
        where: { status: 'pending' },
        orderBy: { id: 'asc' },
      });
      if (!pending) {
        this.logger.error('No pending batches found');
        process.exitCode = 1;
        return;
      }
      batchId = pending.id;
    }

    this.logger.log(`Dispatching process-batch-file job for batch ID: ${batchId}`);
    await this.queueProducer.enqueueProcessBatchFile(batchId);
    this.logger.log('Job dispatched! Check worker output (npm run worker).');
  }
}
