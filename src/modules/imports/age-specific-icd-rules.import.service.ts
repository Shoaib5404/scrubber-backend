import { Injectable } from '@nestjs/common';
import { readFileSync } from 'fs';
import * as path from 'path';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { CodeListImportOptions, CodeListImportResult } from './import.types';
import {
  getMappedColumnValue,
  loadExcelRows,
  mapAgeSpecificIcdExcelColumns,
  normalizeHeader,
  parseImportAgeNumeric,
  parseImportAgeUnit,
} from './import.utils';
import { LookupSyncHelper } from './lookup-sync.helper';

interface AgeSpecificIcdRow {
  icdCode: string;
  description: string | null;
  lowLimit: number | null;
  upperLimit: number | null;
  unit: string;
  isActive: boolean;
}

@Injectable()
export class AgeSpecificIcdRulesImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lookupSync: LookupSyncHelper,
  ) {}

  async importFromFile(
    filePath: string,
    options: CodeListImportOptions = {},
  ): Promise<CodeListImportResult> {
    const ext = path.extname(filePath).toLowerCase();

    if (options.truncate) {
      await this.prisma.$executeRawUnsafe(
        'TRUNCATE TABLE "age_specific_icd_rules" RESTART IDENTITY',
      );
    }

    if (ext === '.json') {
      return this.importFromJson(filePath);
    }
    if (ext !== '.xlsx' && ext !== '.xls') {
      throw new Error('Unsupported file type. Use .xlsx, .xls, or .json');
    }
    return this.importFromExcel(filePath, options);
  }

  private async importFromExcel(
    filePath: string,
    options: CodeListImportOptions,
  ): Promise<CodeListImportResult> {
    const chunkSize = Math.max(1, options.chunk ?? 500);
    const rows = await loadExcelRows(filePath);
    if (rows.length === 0) {
      throw new Error('Excel file is empty.');
    }

    const headers = (rows[0] ?? []).map((header) => normalizeHeader(String(header ?? '')));
    const columnMap = mapAgeSpecificIcdExcelColumns(headers);
    if (columnMap.icd_code === undefined) {
      throw new Error(
        'Could not find ICD code column. Expected one of: icd_code, icd, code, icd10, dx, diagnosis_code',
      );
    }

    let upserted = 0;
    let skipped = 0;
    let batch: AgeSpecificIcdRow[] = [];

    for (const row of rows.slice(1)) {
      const icdCode = getMappedColumnValue(row, columnMap, 'icd_code');
      if (icdCode === null) {
        skipped += 1;
        continue;
      }

      batch.push({
        icdCode,
        description: getMappedColumnValue(row, columnMap, 'description'),
        lowLimit: parseImportAgeNumeric(getMappedColumnValue(row, columnMap, 'low_limit')),
        upperLimit: parseImportAgeNumeric(getMappedColumnValue(row, columnMap, 'upper_limit')),
        unit: parseImportAgeUnit(getMappedColumnValue(row, columnMap, 'unit')),
        isActive: true,
      });

      if (batch.length >= chunkSize) {
        upserted += await this.upsertBatch(batch);
        batch = [];
      }
    }

    if (batch.length > 0) {
      upserted += await this.upsertBatch(batch);
    }

    await this.lookupSync.syncTable('age_specific_icd_rules');
    return { upserted, skipped };
  }

  private async importFromJson(filePath: string): Promise<CodeListImportResult> {
    const content = readFileSync(filePath, 'utf8');
    const data = JSON.parse(content) as { rules?: AgeSpecificIcdJson[] } | AgeSpecificIcdJson[];
    const rules = Array.isArray(data) ? data : (data.rules ?? []);

    let upserted = 0;
    let skipped = 0;
    let batch: AgeSpecificIcdRow[] = [];
    const chunkSize = 1000;

    for (const ruleData of rules) {
      const icdCode = ruleData.icd_code?.trim() ?? '';
      if (icdCode === '') {
        skipped += 1;
        continue;
      }

      const upper = ruleData.upper_limit ?? ruleData.high_limit;
      batch.push({
        icdCode,
        description: ruleData.description ?? null,
        lowLimit:
          ruleData.low_limit !== undefined && ruleData.low_limit !== null
            ? Math.trunc(Number(ruleData.low_limit))
            : null,
        upperLimit: upper !== undefined && upper !== null ? Math.trunc(Number(upper)) : null,
        unit: parseImportAgeUnit(ruleData.unit ?? null),
        isActive: ruleData.is_active ?? true,
      });

      if (batch.length >= chunkSize) {
        upserted += await this.upsertBatch(batch);
        batch = [];
      }
    }

    if (batch.length > 0) {
      upserted += await this.upsertBatch(batch);
    }

    await this.lookupSync.syncTable('age_specific_icd_rules');
    return { upserted, skipped };
  }

  private dedupeByIcdCode(batch: AgeSpecificIcdRow[]): AgeSpecificIcdRow[] {
    const unique = new Map<string, AgeSpecificIcdRow>();
    for (const row of batch) {
      unique.set(row.icdCode, row);
    }
    return [...unique.values()];
  }

  private async upsertBatch(batch: AgeSpecificIcdRow[]): Promise<number> {
    const unique = this.dedupeByIcdCode(batch);
    await this.prisma.$transaction(
      unique.map((row) =>
        this.prisma.ageSpecificIcdRule.upsert({
          where: { icdCode: row.icdCode },
          create: {
            icdCode: row.icdCode,
            description: row.description,
            lowLimit: row.lowLimit,
            upperLimit: row.upperLimit,
            unit: row.unit,
            isActive: row.isActive,
          },
          update: {
            description: row.description,
            lowLimit: row.lowLimit,
            upperLimit: row.upperLimit,
            unit: row.unit,
            isActive: row.isActive,
          },
        }),
      ),
    );
    return unique.length;
  }
}

interface AgeSpecificIcdJson {
  icd_code?: string;
  description?: string | null;
  low_limit?: number | null;
  upper_limit?: number | null;
  high_limit?: number | null;
  unit?: string | null;
  is_active?: boolean;
}
