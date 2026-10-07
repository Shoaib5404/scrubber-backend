import { Injectable } from '@nestjs/common';
import { readFileSync } from 'fs';
import * as path from 'path';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { CodeListImportOptions, CodeListImportResult } from './import.types';
import {
  excelHeadersLowerTrim,
  getMappedColumnValue,
  loadExcelRows,
  mapAgeSpecificCptExcelColumns,
  parseAgeSpecificCptGender,
  parseImportAgeNumeric,
  parseImportAgeUnit,
} from './import.utils';
import { LookupSyncHelper } from './lookup-sync.helper';

interface AgeSpecificCptRow {
  cptCode: string;
  description: string | null;
  lowLimit: number | null;
  highLimit: number | null;
  unit: string;
  gender: string;
  notes: string | null;
  isActive: boolean;
}

@Injectable()
export class AgeSpecificCptRulesImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lookupSync: LookupSyncHelper,
  ) {}

  async importFromFile(
    filePath: string,
    options: CodeListImportOptions = {},
  ): Promise<CodeListImportResult> {
    const ext = path.extname(filePath).toLowerCase();
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

    const headers = excelHeadersLowerTrim(rows[0] ?? []);
    const columnMap = mapAgeSpecificCptExcelColumns(headers);
    if (columnMap.cpt_code === undefined) {
      throw new Error(
        'Could not find CPT code column. Expected one of: cpt_code, cpt, code, procedure_code, hcpcs',
      );
    }

    let upserted = 0;
    let skipped = 0;
    let batch: AgeSpecificCptRow[] = [];

    for (const row of rows.slice(1)) {
      const cptCode = getMappedColumnValue(row, columnMap, 'cpt_code');
      if (cptCode === null) {
        skipped += 1;
        continue;
      }

      batch.push({
        cptCode,
        description: getMappedColumnValue(row, columnMap, 'description'),
        lowLimit: parseImportAgeNumeric(getMappedColumnValue(row, columnMap, 'low_limit')),
        highLimit: parseImportAgeNumeric(getMappedColumnValue(row, columnMap, 'high_limit')),
        unit: parseImportAgeUnit(getMappedColumnValue(row, columnMap, 'unit')),
        gender: parseAgeSpecificCptGender(getMappedColumnValue(row, columnMap, 'gender')),
        notes: getMappedColumnValue(row, columnMap, 'notes'),
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

    await this.lookupSync.syncTable('age_specific_cpt_rules');
    return { upserted, skipped };
  }

  private async importFromJson(filePath: string): Promise<CodeListImportResult> {
    const content = readFileSync(filePath, 'utf8');
    const data = JSON.parse(content) as { rules?: AgeSpecificCptJson[] } | AgeSpecificCptJson[];
    const rules = Array.isArray(data) ? data : (data.rules ?? []);

    let upserted = 0;
    let skipped = 0;
    let batch: AgeSpecificCptRow[] = [];
    const chunkSize = 1000;

    for (const ruleData of rules) {
      const cptCode = ruleData.cpt_code?.trim() ?? '';
      if (cptCode === '') {
        skipped += 1;
        continue;
      }

      batch.push({
        cptCode,
        description: ruleData.description ?? null,
        lowLimit: ruleData.low_limit !== undefined ? Math.trunc(Number(ruleData.low_limit)) : null,
        highLimit: ruleData.high_limit !== undefined ? Math.trunc(Number(ruleData.high_limit)) : null,
        unit: parseImportAgeUnit(ruleData.unit ?? null),
        gender: parseAgeSpecificCptGender(ruleData.gender ?? null),
        notes: ruleData.notes ?? null,
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

    await this.lookupSync.syncTable('age_specific_cpt_rules');
    return { upserted, skipped };
  }

  private dedupeByCptCode(batch: AgeSpecificCptRow[]): AgeSpecificCptRow[] {
    const unique = new Map<string, AgeSpecificCptRow>();
    for (const row of batch) {
      unique.set(row.cptCode, row);
    }
    return [...unique.values()];
  }

  private async upsertBatch(batch: AgeSpecificCptRow[]): Promise<number> {
    const unique = this.dedupeByCptCode(batch);
    await this.prisma.$transaction(
      unique.map((row) =>
        this.prisma.ageSpecificCptRule.upsert({
          where: { cptCode: row.cptCode },
          create: {
            cptCode: row.cptCode,
            description: row.description,
            lowLimit: row.lowLimit,
            highLimit: row.highLimit,
            unit: row.unit,
            gender: row.gender,
            notes: row.notes,
            isActive: row.isActive,
          },
          update: {
            description: row.description,
            lowLimit: row.lowLimit,
            highLimit: row.highLimit,
            unit: row.unit,
            gender: row.gender,
            notes: row.notes,
            isActive: row.isActive,
          },
        }),
      ),
    );
    return unique.length;
  }
}

interface AgeSpecificCptJson {
  cpt_code?: string;
  description?: string | null;
  low_limit?: number;
  high_limit?: number;
  unit?: string | null;
  gender?: string | null;
  notes?: string | null;
  is_active?: boolean;
}
