import { Logger } from '@nestjs/common';
import { Command, CommandRunner, Option } from 'nest-commander';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { NpiOrderingReferringDownloader, NpiSyncStatus } from './npi-ordering-referring.downloader';
import { NpiOrderingReferringImportService } from './npi-ordering-referring.import.service';

interface NpiOrderingReferringSyncCommandOptions {
  force?: boolean;
  skipImport?: boolean;
  chunk?: number;
}

/**
 * Laravel App\Console\Commands\SyncNpiOrderingReferrings (npi-ordering-referrings:sync).
 *
 * NOTE: this command is never invoked by a Nest scheduler — the daily 06:00 America/New_York
 * schedule was commented out in Laravel's bootstrap/app.php (never enabled in production) and
 * stays disabled here pending product re-approval (SP-8 Task 20). Run it manually via
 * `npm run cli -- npi-ordering-referrings:sync`.
 */
@Command({
  name: 'npi-ordering-referrings:sync',
  description: 'Fetch the latest CMS Order and Referring CSV and import it into the database',
})
export class NpiOrderingReferringSyncCommand extends CommandRunner {
  private readonly logger = new Logger(NpiOrderingReferringSyncCommand.name);

  constructor(
    private readonly downloader: NpiOrderingReferringDownloader,
    private readonly importService: NpiOrderingReferringImportService,
    private readonly prisma: PrismaService,
  ) {
    super();
  }

  async run(_passedParams: string[], options: NpiOrderingReferringSyncCommandOptions): Promise<void> {
    const force = Boolean(options.force);
    const skipImport = Boolean(options.skipImport);
    const chunk = options.chunk ?? 1000;

    this.logger.log('=== NPI Ordering/Referring sync started ===');
    this.logger.log(`Force mode: ${force ? 'yes' : 'no'}`);
    this.logger.log(`Skip import: ${skipImport ? 'yes' : 'no'}`);

    const result = await this.downloader
      .fetch(force, (message) => this.logger.log(message))
      .catch((e: unknown) => {
        this.logger.error(`Sync fetch failed: ${e instanceof Error ? e.message : String(e)}`);
        return null;
      });

    if (result === null) {
      process.exitCode = 1;
      return;
    }

    if (result.skipped) {
      this.logger.warn(result.reason ?? 'No new dataset to sync.');

      if (skipImport) {
        this.logger.log('=== Sync finished (no changes) ===');
        return;
      }

      const latest = await this.prisma.npiOrderingReferringSync.findFirst({
        where: { status: NpiSyncStatus.IMPORTED },
        orderBy: { datasetReleaseDate: 'desc' },
      });

      if (latest !== null) {
        this.logger.log(
          `Latest imported release in DB: ${latest.datasetReleaseDate.toISOString().slice(0, 10)}`,
        );
        this.logger.log(`Latest imported file: ${latest.storedCsvPath}`);
      }

      this.logger.log('=== Sync finished (no new download; import not run) ===');
      return;
    }

    const releaseDate = result.datasetReleaseDate ?? '';
    const csvPath = result.csvPath ?? '';

    this.logger.log(`Stored CSV for release ${releaseDate}: ${csvPath}`);

    if (skipImport) {
      this.logger.log('=== Sync finished (download only; import skipped) ===');
      return;
    }

    this.logger.log('--- Starting database import phase ---');
    this.logger.log(`Running: npi-ordering-referrings:import --date=${releaseDate} --chunk=${chunk}`);

    try {
      await this.importService.importFromFile(csvPath, { chunk, syncId: result.sync?.id });
    } catch {
      this.logger.error('Import command failed.');

      if (result.sync) {
        await this.prisma.npiOrderingReferringSync.update({
          where: { id: result.sync.id },
          data: { status: NpiSyncStatus.FAILED, errorMessage: 'Import command failed.' },
        });
      }

      this.logger.log('=== Sync finished with errors ===');
      process.exitCode = 1;
      return;
    }

    if (result.sync) {
      await this.prisma.npiOrderingReferringSync.update({
        where: { id: result.sync.id },
        data: { status: NpiSyncStatus.IMPORTED, importedAt: new Date(), errorMessage: null },
      });
    }

    this.logger.log('Import completed. Sync record updated (status: imported).');
    this.logger.log('=== Sync finished successfully ===');
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
