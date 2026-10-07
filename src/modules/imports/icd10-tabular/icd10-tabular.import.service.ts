import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { LookupSyncHelper } from '../lookup-sync.helper';
import { CHAPTER_CODE_RANGES } from './icd10-tabular-chapter-ranges';
import { parseIcd10TabularFile } from './icd10-tabular.parser';
import { DiagnosisNode } from './icd10-tabular.types';
import { saveIcd10TabularTree, Icd10TabularWriteStats } from './icd10-tabular.writer';

export interface Icd10TabularImportOptions {
  effectiveDate?: Date;
  truncate?: boolean;
  dryRun?: boolean;
}

export interface Icd10TabularImportStats {
  chapterCount: number;
  sectionCount: number;
  /** Every node in the parsed tree (chapters + sections + diag nodes, incl. synthetic 7th-char
   * leaves) — mirrors the (loosely named) Laravel $diagNodeCount, which also starts counting from
   * the top-level chapters themselves. */
  diagnosisNodeCount: number;
  written: number;
}

export interface Icd10TabularUpdateChapterRangesResult {
  updated: number;
}

const TRANSACTION_OPTIONS = { timeout: 600_000, maxWait: 60_000 };

/** Laravel App\Console\Commands\ImportIcd10Tabular::handle — effective date default (today, UTC). */
export function todayUtcDate(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/** Parses `--effective-date=Y-m-d` into a UTC date; throws on any other shape. */
export function parseIcd10TabularEffectiveDate(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) {
    throw new Error(`Invalid --effective-date (expected Y-m-d): ${value}`);
  }
  const [, y, m, d] = match;
  return new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
}

function countNodes(nodes: DiagnosisNode[], counts: { sectionCount: number; diagnosisNodeCount: number }): void {
  for (const n of nodes) {
    if (n.isSection) {
      counts.sectionCount += 1;
    }
    counts.diagnosisNodeCount += 1;
    countNodes(n.diagnosis, counts);
  }
}

/**
 * Port of Laravel App\Console\Commands\ImportIcd10Tabular (icd10:tabular-import) — parses the
 * CMS ICD-10-CM tabular XML via Icd10TabularParser semantics and writes
 * icd10_tabular_codes/icd10_tabular_code_descriptions via Icd10TabularImportWriter semantics.
 */
@Injectable()
export class Icd10TabularImportService {
  private readonly logger = new Logger(Icd10TabularImportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly lookupSync: LookupSyncHelper,
  ) {}

  async importFromFile(filePath: string, options: Icd10TabularImportOptions = {}): Promise<Icd10TabularImportStats> {
    const effectiveStart = options.effectiveDate ?? todayUtcDate();

    const chapters = await parseIcd10TabularFile(filePath, (message) => this.logger.warn(message));

    const counts = { sectionCount: 0, diagnosisNodeCount: 0 };
    countNodes(chapters, counts);
    const stats: Icd10TabularImportStats = {
      chapterCount: chapters.length,
      sectionCount: counts.sectionCount,
      diagnosisNodeCount: counts.diagnosisNodeCount,
      written: 0,
    };

    if (options.dryRun) {
      return stats;
    }

    if (options.truncate) {
      await this.prisma.$executeRawUnsafe(
        'TRUNCATE TABLE "icd10_tabular_code_descriptions", "icd10_tabular_codes" RESTART IDENTITY CASCADE',
      );
    }

    const writeStats: Icd10TabularWriteStats = { processed: 0 };
    await this.prisma.$transaction(
      (tx) => saveIcd10TabularTree(tx, chapters, 0, effectiveStart, writeStats),
      TRANSACTION_OPTIONS,
    );
    stats.written = writeStats.processed;

    await this.lookupSync.syncTable('icd10_tabular_codes');

    return stats;
  }

  /**
   * Laravel ImportIcd10Tabular::updateChapterCodeRanges — rewrites chapter abbreviation codes
   * (e.g. `ID`) to ICD-10-CM chapter code ranges (e.g. `A00-B99`); idempotent (a second run finds
   * no rows still matching the abbreviation `where` clause).
   */
  async updateChapterCodeRanges(): Promise<Icd10TabularUpdateChapterRangesResult> {
    let updated = 0;
    await this.prisma.$transaction(async (tx) => {
      for (const [code, range] of Object.entries(CHAPTER_CODE_RANGES)) {
        const result = await tx.icd10TabularCode.updateMany({
          where: { isChapter: true, code },
          data: { code: range },
        });
        updated += result.count;
      }
    });

    await this.lookupSync.syncTable('icd10_tabular_codes');

    return { updated };
  }
}
