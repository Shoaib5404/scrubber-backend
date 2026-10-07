import { Injectable } from '@nestjs/common';
import { readFileSync } from 'fs';
import * as path from 'path';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  excelCellToTrimmedString,
  getMappedColumnValue,
  loadExcelRows,
  mapCptCodeExcelColumns,
  parseCptImportEffectiveDate,
  excelHeadersLowerTrim,
} from './import.utils';
import { LookupSyncHelper } from './lookup-sync.helper';

export interface CptCodeImportOptions {
  truncate?: boolean;
  chunk?: number;
  merge?: boolean;
  delimiter?: string | null;
  skipHeader?: boolean;
}

export interface CptCodeImportResult {
  imported: number;
  updated: number;
  skipped: number;
  errors: number;
}

interface CptCodeRow {
  name: string;
  description: string | null;
  effectiveDate: Date | null;
  isActive: boolean;
}

@Injectable()
export class CptCodesImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lookupSync: LookupSyncHelper,
  ) {}

  async importFromFile(filePath: string, options: CptCodeImportOptions = {}): Promise<CptCodeImportResult> {
    if (options.truncate) {
      await this.prisma.$executeRawUnsafe('TRUNCATE TABLE "cpt_codes" RESTART IDENTITY');
    }

    const ext = path.extname(filePath).toLowerCase();
    let result: CptCodeImportResult;

    if (ext === '.txt' || ext === '.csv') {
      result = await this.importFromTextFile(filePath, options);
    } else if (ext === '.xlsx' || ext === '.xls') {
      result = await this.importFromExcelFile(filePath, options);
    } else {
      throw new Error('Unsupported file type. Use .xlsx, .xls, .txt, or .csv');
    }

    if (result.errors === 0) {
      await this.lookupSync.syncTable('cpt_codes');
    }

    return result;
  }

  private async importFromTextFile(
    filePath: string,
    options: CptCodeImportOptions,
  ): Promise<CptCodeImportResult> {
    const chunkSize = Math.max(1, options.chunk ?? 1000);
    const merge = options.merge ?? false;
    const delimiter = options.delimiter ?? null;

    let lines = readFileSync(filePath, 'utf8').split(/\r?\n/);
    lines = lines.filter((line) => line.trim() !== '');

    if (options.skipHeader && lines.length > 0) {
      lines = lines.slice(1);
    }

    let imported = 0;
    let updated = 0;
    let skipped = 0;
    const errors = 0;
    let batch: CptCodeRow[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed === '') {
        continue;
      }

      let name: string;
      let description: string | null;

      if (delimiter !== null) {
        const parts = this.splitDelimitedLine(trimmed, delimiter);
        name = (parts[0] ?? '').trim();
        description = parts[1] !== undefined ? parts[1].trim() || null : null;
      } else {
        const parts = trimmed.split(/\s+/, 2);
        name = (parts[0] ?? '').trim();
        description = parts[1] !== undefined ? parts[1].trim() || null : null;
      }

      if (name === '' || name.length < 3 || name.length > 10) {
        skipped += 1;
        continue;
      }

      batch.push({
        name,
        description,
        effectiveDate: null,
        isActive: true,
      });

      if (batch.length >= chunkSize) {
        const counts = await this.persistCptCodeBatch(batch, merge);
        imported += counts.imported;
        updated += counts.updated;
        batch = [];
      }
    }

    if (batch.length > 0) {
      const counts = await this.persistCptCodeBatch(batch, merge);
      imported += counts.imported;
      updated += counts.updated;
    }

    return { imported, updated, skipped, errors };
  }

  private splitDelimitedLine(line: string, delimiter: string): string[] {
    if (delimiter === ',') {
      const parts: string[] = [];
      let current = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i += 1) {
        const char = line[i];
        if (char === '"') {
          inQuotes = !inQuotes;
          continue;
        }
        if (char === delimiter && !inQuotes) {
          parts.push(current);
          current = '';
          continue;
        }
        current += char;
      }
      parts.push(current);
      return parts;
    }
    return line.split(delimiter);
  }

  private async importFromExcelFile(
    filePath: string,
    options: CptCodeImportOptions,
  ): Promise<CptCodeImportResult> {
    const chunkSize = Math.max(1, options.chunk ?? 1000);
    const merge = options.merge ?? false;

    const rows = await loadExcelRows(filePath);
    if (rows.length === 0) {
      throw new Error('Excel file is empty.');
    }

    const headers = excelHeadersLowerTrim(rows[0] ?? []);
    const columnMap = mapCptCodeExcelColumns(headers);
    if (columnMap.name === undefined) {
      throw new Error(`Could not find HCPC/code column in the Excel file. Available: ${headers.join(', ')}`);
    }

    let imported = 0;
    let updated = 0;
    let skipped = 0;
    let errors = 0;
    let batch: CptCodeRow[] = [];

    for (const row of rows.slice(1)) {
      const nameRaw = getMappedColumnValue(row, columnMap, 'name');
      const name = nameRaw === null ? '' : excelCellToTrimmedString(nameRaw);
      if (name === '') {
        skipped += 1;
        continue;
      }

      batch.push({
        name,
        description: getMappedColumnValue(row, columnMap, 'description'),
        effectiveDate: parseCptImportEffectiveDate(getMappedColumnValue(row, columnMap, 'effective_date')),
        isActive: true,
      });

      if (batch.length >= chunkSize) {
        try {
          const counts = await this.persistCptCodeBatch(batch, merge);
          imported += counts.imported;
          updated += counts.updated;
        } catch {
          errors += batch.length;
        }
        batch = [];
      }
    }

    if (batch.length > 0) {
      try {
        const counts = await this.persistCptCodeBatch(batch, merge);
        imported += counts.imported;
        updated += counts.updated;
      } catch {
        errors += batch.length;
      }
    }

    return { imported, updated, skipped, errors };
  }

  private dedupeBatchByName(batch: CptCodeRow[]): CptCodeRow[] {
    const unique = new Map<string, CptCodeRow>();
    for (const row of batch) {
      unique.set(row.name, row);
    }
    return [...unique.values()];
  }

  private async persistCptCodeBatch(
    batch: CptCodeRow[],
    merge: boolean,
  ): Promise<{ imported: number; updated: number }> {
    const records = this.dedupeBatchByName(batch);
    if (records.length === 0) {
      return { imported: 0, updated: 0 };
    }

    if (merge) {
      await this.prisma.$transaction(
        records.map((row) =>
          this.prisma.cptCode.upsert({
            where: { name: row.name },
            create: {
              name: row.name,
              description: row.description,
              effectiveDate: row.effectiveDate,
              isActive: row.isActive,
            },
            update: {
              description: row.description,
              effectiveDate: row.effectiveDate,
              isActive: row.isActive,
            },
          }),
        ),
      );
      return { imported: 0, updated: records.length };
    }

    const result = await this.prisma.cptCode.createMany({
      data: records.map((row) => ({
        name: row.name,
        description: row.description,
        effectiveDate: row.effectiveDate,
        isActive: row.isActive,
      })),
      skipDuplicates: true,
    });

    return { imported: result.count, updated: 0 };
  }
}
