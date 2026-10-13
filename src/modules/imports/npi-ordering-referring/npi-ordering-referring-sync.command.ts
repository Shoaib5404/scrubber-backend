import { Logger } from '@nestjs/common';
import { Command, CommandRunner, Option } from 'nest-commander';
import {
  NpiOrderingReferringSyncService,
  type NpiOrderingReferringSyncOptions,
} from './npi-ordering-referring-sync.service';

/**
 * Laravel App\Console\Commands\SyncNpiOrderingReferrings (npi-ordering-referrings:sync).
 *
 * Also invoked by SchedulerHost when `NPI_SYNC_SCHEDULE_ENABLED=true` (daily 06:00 America/New_York).
 */
@Command({
  name: 'npi-ordering-referrings:sync',
  description: 'Fetch the latest CMS Order and Referring CSV and import it into the database',
})
export class NpiOrderingReferringSyncCommand extends CommandRunner {
  private readonly logger = new Logger(NpiOrderingReferringSyncCommand.name);

  constructor(private readonly syncService: NpiOrderingReferringSyncService) {
    super();
  }

  async run(
    _passedParams: string[],
    options: NpiOrderingReferringSyncOptions,
  ): Promise<void> {
    const result = await this.syncService.run({
      force: Boolean(options.force),
      skipImport: Boolean(options.skipImport),
      chunk: options.chunk ?? 1000,
    });
    if (!result.ok) {
      process.exitCode = 1;
      this.logger.error(result.reason ?? 'NPI sync failed.');
    }
  }

  @Option({
    flags: '--force',
    description: 'Re-download and re-import even if already synced',
  })
  parseForce(): boolean {
    return true;
  }

  @Option({
    flags: '--skip-import',
    description: 'Download only; do not import into the database',
  })
  parseSkipImport(): boolean {
    return true;
  }

  @Option({
    flags: '--chunk [chunk]',
    description: 'Rows per insert batch for the import step',
    defaultValue: '1000',
  })
  parseChunk(val: string): number {
    return Number(val);
  }
}
