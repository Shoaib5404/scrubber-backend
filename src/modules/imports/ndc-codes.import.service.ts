import { Injectable } from '@nestjs/common';
import { readFileSync } from 'fs';
import * as path from 'path';
import { PrismaService } from '../../common/prisma/prisma.service';
import { normalizeNdcFromImport } from '../reference-admin/ndc.util';
import type { CodeListImportOptions } from './import.types';
import {
  getMappedColumnValue,
  loadExcelRowsWithHeaderWorksheet,
  mapNdcCodeExcelColumns,
  normalizeHeader,
} from './import.utils';
import { LookupSyncHelper } from './lookup-sync.helper';

export interface NdcCodesImportResult {
  upserted: number;
  skipped: number;
  invalidNdc: number;
}

interface NdcCodeRow {
  ndc: string;
  ndcDigits: string;
  packageDescription: string | null;
  isActive: boolean;
}

@Injectable()
export class NdcCodesImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lookupSync: LookupSyncHelper,
  ) {}

  async importFromFile(
    filePath: string,
    options: CodeListImportOptions = {},
  ): Promise<NdcCodesImportResult> {
    if (options.truncate) {
      await this.prisma.$executeRawUnsafe('TRUNCATE TABLE "ndc_codes" RESTART IDENTITY');
    }

    const ext = path.extname(filePath).toLowerCase();
    let result: NdcCodesImportResult;

    if (ext === '.json') {
      result = await this.importFromJson(filePath, options);
    } else if (ext === '.xlsx' || ext === '.xls') {
      result = await this.importFromExcel(filePath, options);
    } else {
      throw new Error('Unsupported file type. Use .xlsx, .xls, or .json');
    }

    if (result.invalidNdc === 0) {
      await this.lookupSync.syncTable('ndc_codes');
    }

    return result;
  }

  private async importFromExcel(
    filePath: string,
    options: CodeListImportOptions,
  ): Promise<NdcCodesImportResult> {
    const chunkSize = Math.max(1, options.chunk ?? 1000);
    const rows = await loadExcelRowsWithHeaderWorksheet(filePath);
    if (rows.length === 0) {
      throw new Error('Excel file is empty.');
    }

    const headers = (rows[0] ?? []).map((header) => normalizeHeader(String(header ?? '')));
    const columnMap = mapNdcCodeExcelColumns(headers);
    if (columnMap.ndc === undefined) {
      throw new Error('Could not find required NDC column (expected NDCPACKAGECODE or similar).');
    }

    let upserted = 0;
    let skipped = 0;
    let invalidNdc = 0;
    let batch: NdcCodeRow[] = [];

    for (const row of rows.slice(1)) {
      const ndcRaw = getMappedColumnValue(row, columnMap, 'ndc');
      if (ndcRaw === null) {
        skipped += 1;
        continue;
      }

      const normalized = normalizeNdcFromImport(ndcRaw);
      if (normalized === null) {
        invalidNdc += 1;
        continue;
      }

      batch.push({
        ndc: normalized.ndc,
        ndcDigits: normalized.ndcDigits,
        packageDescription: getMappedColumnValue(row, columnMap, 'package_description'),
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

    return { upserted, skipped, invalidNdc };
  }

  private async importFromJson(
    filePath: string,
    options: CodeListImportOptions,
  ): Promise<NdcCodesImportResult> {
    const chunkSize = Math.max(1, options.chunk ?? 1000);
    const content = readFileSync(filePath, 'utf8');
    const data = JSON.parse(content) as { codes?: NdcCodeJson[] } | NdcCodeJson[];
    const records = Array.isArray(data) ? data : (data.codes ?? []);

    let upserted = 0;
    let invalidNdc = 0;
    let batch: NdcCodeRow[] = [];

    for (const recordData of records) {
      const normalized = normalizeNdcFromImport(recordData.ndc ?? null);
      if (normalized === null) {
        invalidNdc += 1;
        continue;
      }

      batch.push({
        ndc: normalized.ndc,
        ndcDigits: normalized.ndcDigits,
        packageDescription: recordData.package_description ?? recordData.ndc_label ?? null,
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

    return { upserted, skipped: 0, invalidNdc };
  }

  private dedupeByNdcDigits(batch: NdcCodeRow[]): NdcCodeRow[] {
    const unique = new Map<string, NdcCodeRow>();
    for (const row of batch) {
      unique.set(row.ndcDigits, row);
    }
    return [...unique.values()];
  }

  private async persistBatch(batch: NdcCodeRow[]): Promise<number> {
    const unique = this.dedupeByNdcDigits(batch);
    await this.prisma.$transaction(
      unique.map((row) =>
        this.prisma.ndcCode.upsert({
          where: { ndcDigits: row.ndcDigits },
          create: {
            ndc: row.ndc,
            ndcDigits: row.ndcDigits,
            packageDescription: row.packageDescription,
            isActive: row.isActive,
          },
          update: {
            ndc: row.ndc,
            packageDescription: row.packageDescription,
            isActive: row.isActive,
          },
        }),
      ),
    );
    return unique.length;
  }
}

interface NdcCodeJson {
  ndc?: string;
  package_description?: string;
  ndc_label?: string;
  is_active?: boolean;
}
