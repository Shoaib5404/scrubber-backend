import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { CodeListImportOptions, CodeListImportResult } from './import.types';
import {
  dedupeBatchByCompositeKey,
  getCsvValue,
  normalizeHeaders,
  parseCsvFile,
  parseImportActive,
  resolveColumnIndex,
} from './import.utils';
import { LookupSyncHelper } from './lookup-sync.helper';

@Injectable()
export class AnesthesiaCodesWithBillableModifiersImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lookupSync: LookupSyncHelper,
  ) {}

  async importFromFile(
    filePath: string,
    options: CodeListImportOptions = {},
  ): Promise<CodeListImportResult> {
    const chunkSize = Math.max(1, options.chunk ?? 1000);

    if (options.truncate) {
      await this.prisma.$executeRawUnsafe(
        'TRUNCATE TABLE "anesthesia_codes_with_billable_modifiers" RESTART IDENTITY',
      );
    }

    const allRows = parseCsvFile(filePath);
    if (allRows.length === 0) {
      throw new Error('CSV file is empty.');
    }

    const columns = normalizeHeaders(allRows[0] ?? []);
    const codeCol = resolveColumnIndex(columns, ['code'], 0);
    const modifierCol = resolveColumnIndex(columns, ['modifier'], 1);
    const activeCol = columns.active ?? null;

    let upserted = 0;
    let skipped = 0;
    let batch: { code: string; modifier: string; active: boolean }[] = [];

    for (const row of allRows.slice(1)) {
      const code = getCsvValue(row, codeCol);
      const modifier = getCsvValue(row, modifierCol);

      if (code === null || modifier === null) {
        skipped += 1;
        continue;
      }

      batch.push({
        code,
        modifier,
        active: parseImportActive(
          activeCol === null ? null : getCsvValue(row, activeCol),
        ),
      });

      if (batch.length >= chunkSize) {
        upserted += await this.upsertBatch(batch);
        batch = [];
      }
    }

    if (batch.length > 0) {
      upserted += await this.upsertBatch(batch);
    }

    await this.lookupSync.syncTable('anesthesia_codes_with_billable_modifiers');

    return { upserted, skipped };
  }

  private async upsertBatch(
    batch: { code: string; modifier: string; active: boolean }[],
  ): Promise<number> {
    const unique = dedupeBatchByCompositeKey(
      batch.map((row) => ({
        code: row.code,
        modifier: row.modifier,
        active: String(row.active),
      })),
      ['code', 'modifier'],
    ).map((row) => ({
      code: row.code,
      modifier: row.modifier,
      active: row.active === 'true',
    }));

    await this.prisma.$transaction(
      unique.map((row) =>
        this.prisma.anesthesiaCodeWithBillableModifier.upsert({
          where: { code_modifier: { code: row.code, modifier: row.modifier } },
          create: { code: row.code, modifier: row.modifier, active: row.active },
          update: { active: row.active },
        }),
      ),
    );
    return unique.length;
  }
}
