import { Injectable } from '@nestjs/common';
import { readFileSync } from 'fs';
import * as path from 'path';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  normalizeTaxonomyCode,
  normalizeTaxonomySpecialtyName,
} from '../claim-validation/support/taxonomy-code.helper';
import type { CodeListImportOptions } from './import.types';
import {
  getMappedColumnValue,
  loadExcelRowsWithHeaderWorksheet,
  mapTaxonomyCodeExcelColumns,
  normalizeHeader,
} from './import.utils';
import { LookupSyncHelper } from './lookup-sync.helper';

export interface TaxonomyCodesImportResult {
  upserted: number;
  skipped: number;
  invalid: number;
}

interface TaxonomyRow {
  taxonomyCode: string;
  specialtyName: string;
  isActive: boolean;
}

@Injectable()
export class TaxonomyCodesImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lookupSync: LookupSyncHelper,
  ) {}

  async importFromFile(
    filePath: string,
    options: CodeListImportOptions = {},
  ): Promise<TaxonomyCodesImportResult> {
    if (options.truncate) {
      await this.prisma.$executeRawUnsafe('TRUNCATE TABLE "taxonomy_codes" RESTART IDENTITY');
    }

    const ext = path.extname(filePath).toLowerCase();
    let result: TaxonomyCodesImportResult;

    if (ext === '.json') {
      result = await this.importFromJson(filePath, options);
    } else if (ext === '.xlsx' || ext === '.xls') {
      result = await this.importFromExcel(filePath, options);
    } else {
      throw new Error('Unsupported file type. Use .xlsx, .xls, or .json');
    }

    if (result.invalid === 0) {
      await this.lookupSync.syncTable('taxonomy_codes');
    }

    return result;
  }

  private async importFromExcel(
    filePath: string,
    options: CodeListImportOptions,
  ): Promise<TaxonomyCodesImportResult> {
    const chunkSize = Math.max(1, options.chunk ?? 500);
    const rows = await loadExcelRowsWithHeaderWorksheet(filePath);
    if (rows.length === 0) {
      throw new Error('Excel file is empty.');
    }

    const headers = (rows[0] ?? []).map((header) => normalizeHeader(String(header ?? '')));
    const columnMap = mapTaxonomyCodeExcelColumns(headers);
    if (columnMap.taxonomy_code === undefined || columnMap.specialty_name === undefined) {
      throw new Error('Could not find required columns. Expected Taxonomy Codes and Speciality Name.');
    }

    let upserted = 0;
    let skipped = 0;
    let invalid = 0;
    let batch: TaxonomyRow[] = [];

    for (const row of rows.slice(1)) {
      const codeRaw = getMappedColumnValue(row, columnMap, 'taxonomy_code');
      const specialtyRaw = getMappedColumnValue(row, columnMap, 'specialty_name');
      if (codeRaw === null || specialtyRaw === null) {
        skipped += 1;
        continue;
      }

      const taxonomyCode = normalizeTaxonomyCode(codeRaw);
      const specialtyName = normalizeTaxonomySpecialtyName(specialtyRaw);
      if (taxonomyCode === null || specialtyName === null) {
        invalid += 1;
        continue;
      }

      batch.push({
        taxonomyCode,
        specialtyName,
        isActive: true,
      });

      if (batch.length >= chunkSize) {
        upserted += await this.persistBatch(batch);
        batch = [];
      }
    }

    if (batch.length > 0) {
      upserted += await this.persistBatch(batch);
    }

    return { upserted, skipped, invalid };
  }

  private async importFromJson(
    filePath: string,
    options: CodeListImportOptions,
  ): Promise<TaxonomyCodesImportResult> {
    const chunkSize = Math.max(1, options.chunk ?? 500);
    const content = readFileSync(filePath, 'utf8');
    const data = JSON.parse(content) as { codes?: TaxonomyJson[] } | TaxonomyJson[];
    const records = Array.isArray(data) ? data : (data.codes ?? []);

    let upserted = 0;
    let invalid = 0;
    let batch: TaxonomyRow[] = [];

    for (const recordData of records) {
      const taxonomyCode = normalizeTaxonomyCode(recordData.taxonomy_code ?? null);
      const specialtyName = normalizeTaxonomySpecialtyName(
        recordData.specialty_name ?? recordData.speciality_name ?? null,
      );

      if (taxonomyCode === null || specialtyName === null) {
        invalid += 1;
        continue;
      }

      batch.push({
        taxonomyCode,
        specialtyName,
        isActive: recordData.is_active ?? true,
      });

      if (batch.length >= chunkSize) {
        upserted += await this.persistBatch(batch);
        batch = [];
      }
    }

    if (batch.length > 0) {
      upserted += await this.persistBatch(batch);
    }

    return { upserted, skipped: 0, invalid };
  }

  private dedupeByCode(batch: TaxonomyRow[]): TaxonomyRow[] {
    const unique = new Map<string, TaxonomyRow>();
    for (const row of batch) {
      unique.set(row.taxonomyCode, row);
    }
    return [...unique.values()];
  }

  private async persistBatch(batch: TaxonomyRow[]): Promise<number> {
    const unique = this.dedupeByCode(batch);
    await this.prisma.$transaction(
      unique.map((row) =>
        this.prisma.taxonomyCode.upsert({
          where: { taxonomyCode: row.taxonomyCode },
          create: {
            taxonomyCode: row.taxonomyCode,
            specialtyName: row.specialtyName,
            isActive: row.isActive,
          },
          update: {
            specialtyName: row.specialtyName,
            isActive: row.isActive,
          },
        }),
      ),
    );
    return unique.length;
  }
}

interface TaxonomyJson {
  taxonomy_code?: string;
  specialty_name?: string;
  speciality_name?: string;
  is_active?: boolean;
}
