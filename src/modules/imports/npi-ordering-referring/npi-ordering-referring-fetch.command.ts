import { Logger } from '@nestjs/common';
import { Command, CommandRunner, Option } from 'nest-commander';
import { NpiOrderingReferringDownloader } from './npi-ordering-referring.downloader';

interface NpiOrderingReferringFetchCommandOptions {
  force?: boolean;
}

/** Laravel App\Console\Commands\FetchNpiOrderingReferrings (npi-ordering-referrings:fetch). */
@Command({
  name: 'npi-ordering-referrings:fetch',
  description: 'Download the latest CMS Order and Referring zip and store the CSV locally',
})
export class NpiOrderingReferringFetchCommand extends CommandRunner {
  private readonly logger = new Logger(NpiOrderingReferringFetchCommand.name);

  constructor(private readonly downloader: NpiOrderingReferringDownloader) {
    super();
  }

  async run(_passedParams: string[], options: NpiOrderingReferringFetchCommandOptions): Promise<void> {
    const force = Boolean(options.force);

    this.logger.log('=== NPI Ordering/Referring fetch started ===');
    this.logger.log(`Force mode: ${force ? 'yes' : 'no'}`);

    try {
      const result = await this.downloader.fetch(force, (message) => this.logger.log(message));

      if (result.skipped) {
        this.logger.warn(result.reason ?? 'No new dataset to fetch.');
        if (result.csvPath) {
          this.logger.log(`Existing file: ${result.csvPath}`);
        }
        this.logger.log('=== Fetch finished (no changes) ===');
        return;
      }

      const sync = result.sync;
      this.logger.log('Downloaded CMS Order and Referring dataset.');
      this.logger.log(`  Release date: ${result.datasetReleaseDate ?? ''}`);
      this.logger.log(`  Stored file: ${sync?.storedCsvPath ?? ''}`);
      this.logger.log(`  Source CSV: ${sync?.sourceCsvName ?? ''}`);
      this.logger.log(`  File size (bytes): ${sync?.fileSizeBytes ?? ''}`);
      this.logger.log(
        `  Row count: ${sync?.rowCount != null ? sync.rowCount.toLocaleString('en-US') : ''}`,
      );
      this.logger.log(`  Sync status: ${sync?.status ?? ''}`);
      this.logger.log('=== Fetch finished successfully ===');
    } catch (e) {
      this.logger.error(`Fetch failed: ${e instanceof Error ? e.message : String(e)}`);
      process.exitCode = 1;
    }
  }

  @Option({
    flags: '--force',
    description: 'Re-download even if this release is already synced',
  })
  parseForce(): boolean {
    return true;
  }
}
