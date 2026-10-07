import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NcciRulesCacheService } from '../cache/ncci-rules-cache.service';
import {
  detectNcciSourceLabel,
  loadExcelRows,
  nullableTrim,
  parseNcciDate,
  parseNcciInExistencePriorTo1996,
  parseNcciModifier,
} from './import.utils';

export interface NcciImportOptions {
  chunk?: number;
  merge?: boolean;
  source?: string;
}

export interface NcciImportResult {
  source: string;
  imported: number;
  updated: number;
  skipped: number;
  errors: number;
  totalProcessed: number;
}

export interface NcciDefaultFile {
  relativePath: string;
  source: string;
}

interface NcciRow {
  column1: string;
  column2: string;
  inExistencePriorTo1996: boolean;
  effectiveDate: Date | null;
  deletionDate: Date | null;
  modifier: number;
  ptpEditRationale: string | null;
  sourceFile: string;
}

/**
 * Laravel App\Console\Commands\ImportNcci (ncci:import) — reads one of the four
 * `import/ncci_{1..4}.xlsx` files (or an explicit path) starting at DATA_START_ROW,
 * batch-inserts/upserts into the `nccis` table.
 *
 * Nest adaptation: OpenSpout streaming row-by-row is not ported; loadExcelRows() reads the
 * full sheet into memory via exceljs. Fine for current file sizes/tests; revisit with a
 * streaming reader if NCCI files grow large enough to matter.
 */
@Injectable()
export class NcciImportService {
  private readonly logger = new Logger(NcciImportService.name);

  /** Laravel ImportNcci::DATA_START_ROW = 7 (1-based); loadExcelRows() is 0-indexed. */
  private static readonly DATA_START_ROW_INDEX = 6;

  /** Laravel ImportNcci::DEFAULT_FILES. */
  static readonly DEFAULT_FILES: readonly NcciDefaultFile[] = [
    { relativePath: 'import/ncci_1.xlsx', source: 'ncci_1' },
    { relativePath: 'import/ncci_2.xlsx', source: 'ncci_2' },
    { relativePath: 'import/ncci_3.xlsx', source: 'ncci_3' },
    { relativePath: 'import/ncci_4.xlsx', source: 'ncci_4' },
  ];

  constructor(
    private readonly prisma: PrismaService,
    private readonly ncciRulesCache: NcciRulesCacheService,
  ) {}

  detectSourceLabel(filePath: string): string {
    return detectNcciSourceLabel(filePath);
  }

  /**
   * Laravel ImportNcci::handle `--fresh` branch — truncate then invalidate the cache.
   * Nest stand-in for `RedisHelper::flushGroup('ncci')` + `NcciRulesCacheService::flush()`.
   */
  async truncateAndInvalidate(): Promise<void> {
    await this.prisma.$executeRawUnsafe('TRUNCATE TABLE "nccis" RESTART IDENTITY');
    await this.ncciRulesCache.invalidateFullTable();
  }

  async importFromFile(filePath: string, options: NcciImportOptions = {}): Promise<NcciImportResult> {
    const chunkSize = Math.max(1, options.chunk ?? 1000);
    const merge = options.merge ?? false;
    const source = options.source ?? this.detectSourceLabel(filePath);

    const rows = await loadExcelRows(filePath);

    let imported = 0;
    let updated = 0;
    let skipped = 0;
    let errors = 0;
    let totalProcessed = 0;
    let batch: NcciRow[] = [];

    for (const row of rows.slice(NcciImportService.DATA_START_ROW_INDEX)) {
      const column1 = (row[0] ?? '').trim();
      const column2 = (row[1] ?? '').trim();

      if (column1 === '' || column2 === '') {
        skipped += 1;
        continue;
      }

      batch.push({
        column1,
        column2,
        inExistencePriorTo1996: parseNcciInExistencePriorTo1996(row[2] ?? null),
        effectiveDate: parseNcciDate(row[3] ?? null),
        deletionDate: parseNcciDate(row[4] ?? null),
        modifier: parseNcciModifier(row[5] ?? null),
        ptpEditRationale: nullableTrim(row[6] ?? null),
        sourceFile: source,
      });

      if (batch.length >= chunkSize) {
        const counts = await this.persistBatchSafely(batch, merge, source);
        imported += counts.imported;
        updated += counts.updated;
        errors += counts.errors;
        totalProcessed += batch.length;
        batch = [];
      }
    }

    if (batch.length > 0) {
      const counts = await this.persistBatchSafely(batch, merge, source);
      imported += counts.imported;
      updated += counts.updated;
      errors += counts.errors;
      totalProcessed += batch.length;
    }

    if (errors === 0) {
      // Laravel: RedisHelper::flushGroup('ncci') + NcciRulesCacheService::flush() post-commit.
      await this.ncciRulesCache.invalidateFullTable();
    }

    return { source, imported, updated, skipped, errors, totalProcessed };
  }

  /**
   * Laravel ImportNcci::importAllFiles — iterate the 4 default files, skipping any that
   * are missing, truncating/cache-flushing once up front via `truncateAndInvalidate()`
   * from the caller (command layer), not per-file.
   */
  async importDefaultFiles(
    resolvePath: (relativePath: string) => string,
    fileExists: (filePath: string) => boolean,
    options: Omit<NcciImportOptions, 'source'> = {},
  ): Promise<{ files: NcciImportResult[]; skippedFiles: string[] }> {
    const files: NcciImportResult[] = [];
    const skippedFiles: string[] = [];

    for (const { relativePath, source } of NcciImportService.DEFAULT_FILES) {
      const filePath = resolvePath(relativePath);
      if (!fileExists(filePath)) {
        skippedFiles.push(relativePath);
        continue;
      }
      files.push(await this.importFromFile(filePath, { ...options, source }));
    }

    return { files, skippedFiles };
  }

  private async persistBatchSafely(
    batch: NcciRow[],
    merge: boolean,
    source: string,
  ): Promise<{ imported: number; updated: number; errors: number }> {
    try {
      return { ...(await this.persistBatch(batch, merge)), errors: 0 };
    } catch (e) {
      this.logger.error(
        `NCCI batch persist failed for ${source}: ${e instanceof Error ? e.message : String(e)}`,
      );
      return { imported: 0, updated: 0, errors: batch.length };
    }
  }

  private dedupeBatch(batch: NcciRow[]): NcciRow[] {
    const unique = new Map<string, NcciRow>();
    for (const row of batch) {
      const dateKey = row.effectiveDate ? row.effectiveDate.toISOString().slice(0, 10) : '';
      unique.set(`${row.column1}|${row.column2}|${dateKey}`, row);
    }
    return [...unique.values()];
  }

  private async persistBatch(
    batch: NcciRow[],
    merge: boolean,
  ): Promise<{ imported: number; updated: number }> {
    const records = this.dedupeBatch(batch);
    if (records.length === 0) {
      return { imported: 0, updated: 0 };
    }

    if (!merge) {
      const result = await this.prisma.ncci.createMany({
        data: records.map((row) => ({
          column1: row.column1,
          column2: row.column2,
          inExistencePriorTo1996: row.inExistencePriorTo1996,
          effectiveDate: row.effectiveDate,
          deletionDate: row.deletionDate,
          modifier: row.modifier,
          ptpEditRationale: row.ptpEditRationale,
          sourceFile: row.sourceFile,
          isActive: true,
        })),
        skipDuplicates: true,
      });
      return { imported: result.count, updated: 0 };
    }

    // Postgres treats NULL as distinct within the [column1, column2, effectiveDate] compound
    // unique index, so Prisma's generated compound-unique selector cannot target rows where
    // effectiveDate is null. Fall back to findFirst + update/create for those rows (same
    // pattern as CptPosRulesImportService / CptModifierRulesImportService — SP-8 Task 19
    // group 7, reused here for group 9).
    for (const row of records) {
      const sharedData = {
        inExistencePriorTo1996: row.inExistencePriorTo1996,
        deletionDate: row.deletionDate,
        modifier: row.modifier,
        ptpEditRationale: row.ptpEditRationale,
        sourceFile: row.sourceFile,
        isActive: true,
      };

      if (row.effectiveDate === null) {
        const existing = await this.prisma.ncci.findFirst({
          where: { column1: row.column1, column2: row.column2, effectiveDate: null },
        });
        if (existing) {
          await this.prisma.ncci.update({ where: { id: existing.id }, data: sharedData });
        } else {
          await this.prisma.ncci.create({
            data: { column1: row.column1, column2: row.column2, effectiveDate: null, ...sharedData },
          });
        }
      } else {
        await this.prisma.ncci.upsert({
          where: {
            column1_column2_effectiveDate: {
              column1: row.column1,
              column2: row.column2,
              effectiveDate: row.effectiveDate,
            },
          },
          create: {
            column1: row.column1,
            column2: row.column2,
            effectiveDate: row.effectiveDate,
            ...sharedData,
          },
          update: sharedData,
        });
      }
    }
    return { imported: 0, updated: records.length };
  }
}
