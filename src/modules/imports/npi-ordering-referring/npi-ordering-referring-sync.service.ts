import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { NpiOrderingReferringDownloader, NpiSyncStatus } from './npi-ordering-referring.downloader';
import { NpiOrderingReferringImportService } from './npi-ordering-referring.import.service';

export type NpiOrderingReferringSyncOptions = {
  force?: boolean;
  skipImport?: boolean;
  chunk?: number;
};

export type NpiOrderingReferringSyncResult = {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
};

/**
 * Shared orchestration for `npi-ordering-referrings:sync` (CLI + daily scheduler).
 * Mirrors Laravel App\Console\Commands\SyncNpiOrderingReferrings.
 */
@Injectable()
export class NpiOrderingReferringSyncService {
  private readonly logger = new Logger(NpiOrderingReferringSyncService.name);

  constructor(
    private readonly downloader: NpiOrderingReferringDownloader,
    private readonly importService: NpiOrderingReferringImportService,
    private readonly prisma: PrismaService,
  ) {}

  async run(options: NpiOrderingReferringSyncOptions = {}): Promise<NpiOrderingReferringSyncResult> {
    const force = Boolean(options.force);
    const skipImport = Boolean(options.skipImport);
    const chunk = options.chunk ?? 1000;

    this.logger.log('=== NPI Ordering/Referring sync started ===');
    this.logger.log(`Force mode: ${force ? 'yes' : 'no'}`);
    this.logger.log(`Skip import: ${skipImport ? 'yes' : 'no'}`);

    let result: Awaited<ReturnType<NpiOrderingReferringDownloader['fetch']>>;
    try {
      result = await this.downloader.fetch(force, (message) => this.logger.log(message));
    } catch (e: unknown) {
      this.logger.error(`Sync fetch failed: ${e instanceof Error ? e.message : String(e)}`);
      return { ok: false, reason: e instanceof Error ? e.message : String(e) };
    }

    if (result.skipped) {
      this.logger.warn(result.reason ?? 'No new dataset to sync.');

      if (skipImport) {
        this.logger.log('=== Sync finished (no changes) ===');
        return { ok: true, skipped: true, reason: result.reason };
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
      return { ok: true, skipped: true, reason: result.reason };
    }

    const releaseDate = result.datasetReleaseDate ?? '';
    const csvPath = result.csvPath ?? '';

    this.logger.log(`Stored CSV for release ${releaseDate}: ${csvPath}`);

    if (skipImport) {
      this.logger.log('=== Sync finished (download only; import skipped) ===');
      return { ok: true };
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
      return { ok: false, reason: 'Import command failed.' };
    }

    if (result.sync) {
      await this.prisma.npiOrderingReferringSync.update({
        where: { id: result.sync.id },
        data: { status: NpiSyncStatus.IMPORTED, importedAt: new Date(), errorMessage: null },
      });
    }

    this.logger.log('Import completed. Sync record updated (status: imported).');
    this.logger.log('=== Sync finished successfully ===');
    return { ok: true };
  }
}
