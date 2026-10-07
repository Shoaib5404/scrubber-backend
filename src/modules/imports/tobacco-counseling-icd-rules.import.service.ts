import { Injectable } from '@nestjs/common';
import { readFileSync } from 'fs';
import * as path from 'path';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { CodeListImportOptions, CodeListImportResult } from './import.types';
import {
  getMappedColumnValue,
  loadExcelRows,
  mapTobaccoCounselingIcdExcelColumns,
  normalizeHeader,
  parseTobaccoCounselingIndicator,
} from './import.utils';
import { LookupSyncHelper } from './lookup-sync.helper';

interface TobaccoCounselingIcdRow {
  icdCode: string;
  description: string | null;
  indicator: boolean;
  isActive: boolean;
}

@Injectable()
export class TobaccoCounselingIcdRulesImportService {
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
        'TRUNCATE TABLE "tobacco_counseling_icd_rules" RESTART IDENTITY',
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
    const columnMap = mapTobaccoCounselingIcdExcelColumns(headers);
    if (columnMap.icd_code === undefined) {
      throw new Error(
        'Could not find ICD code column. Expected one of: icd_code, icd, icd list, code, icd10',
      );
    }

    let upserted = 0;
    let skipped = 0;
    let batch: TobaccoCounselingIcdRow[] = [];

    for (const row of rows.slice(1)) {
      const icdCode = getMappedColumnValue(row, columnMap, 'icd_code');
      if (icdCode === null) {
        skipped += 1;
        continue;
      }

      batch.push({
        icdCode,
        description: getMappedColumnValue(row, columnMap, 'description'),
        indicator: parseTobaccoCounselingIndicator(
          getMappedColumnValue(row, columnMap, 'indicator'),
        ),
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

    await this.lookupSync.syncTable('tobacco_counseling_icd_rules');
    return { upserted, skipped };
  }

  private async importFromJson(filePath: string): Promise<CodeListImportResult> {
    const content = readFileSync(filePath, 'utf8');
    const data = JSON.parse(content) as
      | { rules?: TobaccoCounselingIcdJson[] }
      | TobaccoCounselingIcdJson[];
    const rules = Array.isArray(data) ? data : (data.rules ?? []);

    let upserted = 0;
    let skipped = 0;
    let batch: TobaccoCounselingIcdRow[] = [];
    const chunkSize = 1000;

    for (const ruleData of rules) {
      const icdCode = ruleData.icd_code?.trim() ?? '';
      if (icdCode === '') {
        skipped += 1;
        continue;
      }

      batch.push({
        icdCode,
        description: ruleData.description ?? null,
        indicator: parseTobaccoCounselingJsonIndicator(ruleData.indicator),
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

    await this.lookupSync.syncTable('tobacco_counseling_icd_rules');
    return { upserted, skipped };
  }

  private dedupeByIcdCode(batch: TobaccoCounselingIcdRow[]): TobaccoCounselingIcdRow[] {
    const unique = new Map<string, TobaccoCounselingIcdRow>();
    for (const row of batch) {
      unique.set(row.icdCode, row);
    }
    return [...unique.values()];
  }

  private async upsertBatch(batch: TobaccoCounselingIcdRow[]): Promise<number> {
    const unique = this.dedupeByIcdCode(batch);
    await this.prisma.$transaction(
      unique.map((row) =>
        this.prisma.tobaccoCounselingIcdRule.upsert({
          where: { icdCode: row.icdCode },
          create: {
            icdCode: row.icdCode,
            description: row.description,
            indicator: row.indicator,
            isActive: row.isActive,
          },
          update: {
            description: row.description,
            indicator: row.indicator,
            isActive: row.isActive,
          },
        }),
      ),
    );
    return unique.length;
  }
}

interface TobaccoCounselingIcdJson {
  icd_code?: string;
  description?: string | null;
  indicator?: string | boolean | null;
  is_active?: boolean;
}

function parseTobaccoCounselingJsonIndicator(value: string | boolean | null | undefined): boolean {
  if (value === undefined || value === null) {
    return true;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  return parseTobaccoCounselingIndicator(value);
}
