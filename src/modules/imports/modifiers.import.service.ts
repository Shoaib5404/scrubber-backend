import { Injectable } from '@nestjs/common';
import * as path from 'path';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { CodeListImportOptions, CodeListImportResult } from './import.types';
import {
  getCsvValue,
  loadExcelRows,
  normalizeHeaders,
  parseModifierImportDate,
  resolveColumnIndex,
} from './import.utils';
import { LookupSyncHelper } from './lookup-sync.helper';

interface ModifierRow {
  modifier: string;
  shortDescription: string | null;
  addDt: Date | null;
  actEffDt: Date | null;
  termDt: Date | null;
}

@Injectable()
export class ModifiersImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lookupSync: LookupSyncHelper,
  ) {}

  async importFromFile(
    filePath: string,
    options: CodeListImportOptions = {},
  ): Promise<CodeListImportResult> {
    const ext = path.extname(filePath).toLowerCase();
    if (ext !== '.xlsx' && ext !== '.xls') {
      throw new Error('Unsupported file type. Use .xlsx or .xls');
    }

    if (options.truncate) {
      await this.prisma.$executeRawUnsafe('TRUNCATE TABLE "modifiers" RESTART IDENTITY');
    }

    const result = await this.importFromExcel(filePath, options);
    await this.lookupSync.syncTable('modifiers');
    return result;
  }

  private async importFromExcel(
    filePath: string,
    options: CodeListImportOptions,
  ): Promise<CodeListImportResult> {
    const chunkSize = Math.max(1, options.chunk ?? 1000);
    const rows = await loadExcelRows(filePath);
    if (rows.length === 0) {
      throw new Error('Excel file is empty.');
    }

    const headerRow = rows[0] ?? [];
    const columns = normalizeHeaders(headerRow.map((cell) => String(cell ?? '')));

    const modifierCol = resolveColumnIndex(columns, ['modifier'], 0);
    const descriptionCol = resolveColumnIndex(columns, ['short_description'], 1);
    const addDtCol = resolveColumnIndex(columns, ['add_dt'], 2);
    const actEffDtCol = resolveColumnIndex(columns, ['act_eff_dt'], 3);
    const termDtCol = resolveColumnIndex(columns, ['term_dt'], 4);

    let upserted = 0;
    let skipped = 0;
    let batch: ModifierRow[] = [];

    for (const row of rows.slice(1)) {
      const modifier = getCsvValue(row, modifierCol);
      if (modifier === null) {
        skipped += 1;
        continue;
      }

      batch.push({
        modifier,
        shortDescription: getCsvValue(row, descriptionCol),
        addDt: parseModifierImportDate(getCsvValue(row, addDtCol)),
        actEffDt: parseModifierImportDate(getCsvValue(row, actEffDtCol)),
        termDt: parseModifierImportDate(getCsvValue(row, termDtCol)),
      });

      if (batch.length >= chunkSize) {
        upserted += await this.upsertBatch(batch);
        batch = [];
      }
    }

    if (batch.length > 0) {
      upserted += await this.upsertBatch(batch);
    }

    return { upserted, skipped };
  }

  private async upsertBatch(batch: ModifierRow[]): Promise<number> {
    await this.prisma.$transaction(
      batch.map((row) =>
        this.prisma.modifier.upsert({
          where: { modifier: row.modifier },
          create: {
            modifier: row.modifier,
            shortDescription: row.shortDescription,
            addDt: row.addDt,
            actEffDt: row.actEffDt,
            termDt: row.termDt,
          },
          update: {
            shortDescription: row.shortDescription,
            addDt: row.addDt,
            actEffDt: row.actEffDt,
            termDt: row.termDt,
          },
        }),
      ),
    );
    return batch.length;
  }
}
