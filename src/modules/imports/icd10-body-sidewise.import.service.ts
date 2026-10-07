import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { chunkArray, loadExcelRows, mapIcd10BodySidewiseColumns, normalizeHeader, nullableTrim } from './import.utils';
import { LookupSyncHelper } from './lookup-sync.helper';

export interface Icd10BodySidewiseImportOptions {
  truncate?: boolean;
  chunk?: number;
}

export interface Icd10BodySidewiseImportResult {
  imported: number;
  skipped: number;
}

interface Icd10BodySidewiseRow {
  code: string;
  longDescription: string | null;
  side: string | null;
}

/** Laravel App\Console\Commands\ImportIcd10BodySidewise (icd10-body-sidewise:import). */
@Injectable()
export class Icd10BodySidewiseImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lookupSync: LookupSyncHelper,
  ) {}

  async importFromFile(
    filePath: string,
    options: Icd10BodySidewiseImportOptions = {},
  ): Promise<Icd10BodySidewiseImportResult> {
    if (options.truncate) {
      await this.prisma.$executeRawUnsafe('TRUNCATE TABLE "icd10_body_sidewise" RESTART IDENTITY');
    }

    const chunkSize = Math.max(1, options.chunk ?? 1000);

    const rows = await loadExcelRows(filePath);
    if (rows.length === 0) {
      throw new Error('Excel file is empty.');
    }

    const headers = (rows[0] ?? []).map((header) => normalizeHeader(String(header ?? '')));
    const columns = mapIcd10BodySidewiseColumns(headers);

    let imported = 0;
    let skipped = 0;
    let batch: Icd10BodySidewiseRow[] = [];

    for (const row of rows.slice(1)) {
      const code = nullableTrim(row[columns.code] ?? null);
      if (code === null) {
        skipped += 1;
        continue;
      }

      batch.push({
        code,
        longDescription: nullableTrim(row[columns.description] ?? null),
        side: nullableTrim(row[columns.side] ?? null),
      });

      if (batch.length >= chunkSize) {
        imported += await this.insertBatch(batch);
        batch = [];
      }
    }

    if (batch.length > 0) {
      imported += await this.insertBatch(batch);
    }

    await this.lookupSync.syncTable('icd10_body_sidewise');

    return { imported, skipped };
  }

  private async insertBatch(batch: Icd10BodySidewiseRow[]): Promise<number> {
    let count = 0;
    for (const rows of chunkArray(batch, 1000)) {
      const result = await this.prisma.icd10BodySidewise.createMany({
        data: rows.map((row) => ({
          code: row.code,
          longDescription: row.longDescription,
          side: row.side,
        })),
      });
      count += result.count;
    }
    return count;
  }
}
