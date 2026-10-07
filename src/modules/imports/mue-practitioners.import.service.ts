import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { loadExcelRows, nullableTrim, parseMueEffectiveDate, parseMueNumericCell } from './import.utils';
import { LookupSyncHelper } from './lookup-sync.helper';

export interface MuePractitionersImportOptions {
  truncate?: boolean;
  chunk?: number;
}

export interface MuePractitionersImportResult {
  upserted: number;
  skipped: number;
}

interface MuePractitionerRow {
  cptCode: string;
  lowerLimit: string | null;
  upperLimit: string | null;
  indicator: string | null;
  effectiveDate: Date | null;
}

/** Laravel App\Console\Commands\ImportMuePractitioners (mue-practitioners:import). */
@Injectable()
export class MuePractitionersImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lookupSync: LookupSyncHelper,
  ) {}

  async importFromFile(
    filePath: string,
    options: MuePractitionersImportOptions = {},
  ): Promise<MuePractitionersImportResult> {
    if (options.truncate) {
      // Laravel calls MuePractitioner::query()->delete() (not truncate).
      await this.prisma.muePractitioner.deleteMany({});
    }

    const chunkSize = Math.max(1, options.chunk ?? 500);

    const rows = await loadExcelRows(filePath);
    if (rows.length === 0) {
      throw new Error('Excel file is empty.');
    }

    let upserted = 0;
    let skipped = 0;
    let batch: MuePractitionerRow[] = [];

    // Row 1 (index 0) is the header; data begins at row 2 (index 1).
    for (const row of rows.slice(1)) {
      const cpt = (row[0] ?? '').trim();
      const upperCpt = cpt.toUpperCase();
      if (cpt === '' || upperCpt.includes('HCPCS') || upperCpt.includes('CPT')) {
        skipped += 1;
        continue;
      }

      batch.push({
        cptCode: cpt,
        lowerLimit: parseMueNumericCell(row[1] ?? null),
        upperLimit: parseMueNumericCell(row[2] ?? null),
        indicator: nullableTrim(row[3] ?? null),
        effectiveDate: parseMueEffectiveDate(row[4] ?? null),
      });

      if (batch.length >= chunkSize) {
        upserted += await this.flushBatch(batch);
        batch = [];
      }
    }

    if (batch.length > 0) {
      upserted += await this.flushBatch(batch);
    }

    // Laravel also calls RedisHelper::flushGroup('mue_practitioners'); Nest relies solely on
    // LookupCacheService invalidation below.
    await this.lookupSync.syncTable('mue_practitioners');

    return { upserted, skipped };
  }

  private dedupeBatch(batch: MuePractitionerRow[]): MuePractitionerRow[] {
    const unique = new Map<string, MuePractitionerRow>();
    for (const row of batch) {
      unique.set(row.cptCode, row);
    }
    return [...unique.values()];
  }

  private async flushBatch(batch: MuePractitionerRow[]): Promise<number> {
    const records = this.dedupeBatch(batch);
    if (records.length === 0) {
      return 0;
    }

    await this.prisma.$transaction(
      records.map((row) =>
        this.prisma.muePractitioner.upsert({
          where: { cptCode: row.cptCode },
          create: {
            cptCode: row.cptCode,
            lowerLimit: row.lowerLimit,
            upperLimit: row.upperLimit,
            indicator: row.indicator,
            effectiveDate: row.effectiveDate,
          },
          update: {
            lowerLimit: row.lowerLimit,
            upperLimit: row.upperLimit,
            indicator: row.indicator,
            effectiveDate: row.effectiveDate,
          },
        }),
      ),
    );
    return records.length;
  }
}
