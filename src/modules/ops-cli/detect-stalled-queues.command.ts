import { Logger } from '@nestjs/common';
import { Command, CommandRunner, Option } from 'nest-commander';
import { DetectStalledQueuesService } from '../queue/detect-stalled-queues.service';

interface DetectStalledQueuesOptions {
  minutes?: number;
}

/** Laravel App\Console\Commands\DetectStalledQueueValidations (scrubber:detect-stalled-queues). */
@Command({
  name: 'scrubber:detect-stalled-queues',
  description: 'Log stalled claim-validation batches past the stall threshold',
})
export class DetectStalledQueuesCommand extends CommandRunner {
  private readonly logger = new Logger(DetectStalledQueuesCommand.name);

  constructor(private readonly detectStalledQueues: DetectStalledQueuesService) {
    super();
  }

  async run(_passedParams: string[], options: DetectStalledQueuesOptions): Promise<void> {
    const result = await this.detectStalledQueues.run(options.minutes);
    this.logger.log(`Checked ${result.checked} stalled batch(es); wrote ${result.logged} stall upload log(s).`);
  }

  @Option({
    flags: '--minutes [minutes]',
    description: 'Override stall threshold in minutes',
  })
  parseMinutes(val: string): number {
    return Number(val);
  }
}
