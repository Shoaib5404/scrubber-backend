import { Injectable, Logger } from '@nestjs/common';
import { accessSync, constants } from 'fs';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { getCsvValue, normalizeHeaders, resolveColumnIndex } from '../import.utils';
import { LookupSyncHelper } from '../lookup-sync.helper';
import { forEachNpiCsvRow, readNpiCsvHeaderRow } from './npi-ordering-referring-csv.util';

export interface NpiOrderingReferringImportOptions {
  /** Rows per upsert batch. Laravel default: 1000. */
  chunk?: number;
  /** Truncate npi_ordering_referrings before import. Laravel --truncate. */
  truncate?: boolean;
  /** Update npi_ordering_referring_syncs.row_count after a successful import. Laravel --sync-id. */
  syncId?: number;
}

export interface NpiOrderingReferringImportStats {
  processed: number;
  upserted: number;
  skippedBlankNpi: number;
  deactivated: number;
}

interface NpiBatchRow {
  npi: string;
  firstName: string | null;
  lastName: string | null;
}

const DEFAULT_CHUNK = 1000;
const TABLE = 'npi_ordering_referrings';

/**
 * Port of Laravel App\Console\Commands\ImportNpiOrderingReferrings (npi-ordering-referrings:import).
 * Streams the CSV (NPI, LAST_NAME, FIRST_NAME), upserts by `npi`, stamps every touched row with
 * one shared `lastSeenAt` for the whole run, then deactivates any previously-active row not seen
 * in this import (`lastSeenAt` null or older than the run's stamp) — mirroring Laravel's
 * single-timestamp "last seen" sweep rather than a per-row comparison.
 */
@Injectable()
export class NpiOrderingReferringImportService {
  private readonly logger = new Logger(NpiOrderingReferringImportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly lookupSync: LookupSyncHelper,
  ) {}

  async importFromFile(
    filePath: string,
    options: NpiOrderingReferringImportOptions = {},
  ): Promise<NpiOrderingReferringImportStats> {
    accessSync(filePath, constants.R_OK);

    const chunkSize = Math.max(1, options.chunk ?? DEFAULT_CHUNK);

    if (options.truncate) {
      this.logger.warn(`Truncating ${TABLE} table...`);
      await this.prisma.$executeRawUnsafe(`TRUNCATE TABLE "${TABLE}"`);
    }

    // Laravel ImportNpiOrderingReferrings::normalizeHeaders — peek the header row first so the
    // data-row pass below (which re-reads the file and discards its own first/header record) uses
    // the correct columns from the start, instead of guessing with defaults and potentially
    // upserting bad data before a column mismatch is even detected.
    const headerRow = await readNpiCsvHeaderRow(filePath);
    if (headerRow.length === 0) {
      throw new Error('CSV file is empty.');
    }
    const columns = normalizeHeaders(headerRow);
    const npiCol = resolveColumnIndex(columns, ['npi'], 0);
    const lastNameCol = resolveColumnIndex(columns, ['last_name'], 1);
    const firstNameCol = resolveColumnIndex(columns, ['first_name'], 2);

    const stats: NpiOrderingReferringImportStats = {
      processed: 0,
      upserted: 0,
      skippedBlankNpi: 0,
      deactivated: 0,
    };

    const importedAt = new Date();
    let batch: NpiBatchRow[] = [];

    const flush = async (): Promise<void> => {
      if (batch.length === 0) {
        return;
      }
      stats.upserted += await this.upsertBatch(batch, importedAt);
      batch = [];
    };

    await forEachNpiCsvRow(filePath, async (row) => {
      stats.processed += 1;

      const npi = getCsvValue(row, npiCol);
      if (npi === null) {
        stats.skippedBlankNpi += 1;
        return;
      }

      batch.push({
        npi,
        lastName: getCsvValue(row, lastNameCol),
        firstName: getCsvValue(row, firstNameCol),
      });

      if (batch.length >= chunkSize) {
        await flush();
      }
    });

    await flush();

    stats.deactivated = await this.deactivateRowsNotSeenSince(importedAt);

    if (options.syncId !== undefined) {
      await this.updateSyncRowCount(options.syncId, stats.processed);
    }

    await this.lookupSync.syncTable(TABLE);

    return stats;
  }

  /** Laravel ImportNpiOrderingReferrings::upsertBatch (+ uniqueRowsByNpi dedupe). */
  private async upsertBatch(batch: NpiBatchRow[], lastSeenAt: Date): Promise<number> {
    const uniqueByNpi = new Map<string, NpiBatchRow>();
    for (const row of batch) {
      uniqueByNpi.set(row.npi, row);
    }
    const records = [...uniqueByNpi.values()];

    await this.prisma.$transaction(
      records.map((row) =>
        this.prisma.npiOrderingReferring.upsert({
          where: { npi: row.npi },
          create: {
            npi: row.npi,
            firstName: row.firstName,
            lastName: row.lastName,
            active: true,
            lastSeenAt,
          },
          update: {
            firstName: row.firstName,
            lastName: row.lastName,
            active: true,
            lastSeenAt,
          },
        }),
      ),
    );

    return records.length;
  }

  /** Laravel ImportNpiOrderingReferrings::deactivateRowsNotSeenSince. */
  private async deactivateRowsNotSeenSince(lastSeenAt: Date): Promise<number> {
    const result = await this.prisma.npiOrderingReferring.updateMany({
      where: {
        active: true,
        OR: [{ lastSeenAt: null }, { lastSeenAt: { lt: lastSeenAt } }],
      },
      data: { active: false },
    });
    return result.count;
  }

  /** Laravel ImportNpiOrderingReferrings::updateSyncRowCount. */
  private async updateSyncRowCount(syncId: number, processed: number): Promise<void> {
    const result = await this.prisma.npiOrderingReferringSync.updateMany({
      where: { id: syncId },
      data: { rowCount: processed },
    });
    if (result.count > 0) {
      this.logger.log(`Sync record row_count updated: ${processed.toLocaleString('en-US')}`);
    }
  }
}
