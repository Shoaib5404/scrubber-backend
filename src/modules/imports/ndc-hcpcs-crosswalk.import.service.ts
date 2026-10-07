import { Injectable } from '@nestjs/common';
import { readFileSync } from 'fs';
import * as path from 'path';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { normalizeNdcFromImport } from '../reference-admin/ndc.util';
import type { CodeListImportOptions } from './import.types';
import {
  getMappedColumnValue,
  loadExcelRowsWithHeaderWorksheet,
  mapNdcHcpcsCrosswalkExcelColumns,
  normalizeHeader,
  parseImportOptionalFloat,
  parseImportOptionalInteger,
} from './import.utils';
import { LookupSyncHelper } from './lookup-sync.helper';

export interface NdcHcpcsCrosswalkImportResult {
  imported: number;
  skippedExisting: number;
  skipped: number;
  invalidNdc: number;
  errors: number;
}

interface CrosswalkRow {
  ndc: string;
  hcpcs: string;
  ndcLabel: string | null;
  hcpcsAmount: number | null;
  hcpcsMeasure: string | null;
  packageItemCount: number | null;
  isActive: boolean;
}

@Injectable()
export class NdcHcpcsCrosswalkImportService {
  private existingKeys: Map<string, true> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly lookupSync: LookupSyncHelper,
  ) {}

  async importFromFile(
    filePath: string,
    options: CodeListImportOptions = {},
  ): Promise<NdcHcpcsCrosswalkImportResult> {
    this.existingKeys = null;

    if (options.truncate) {
      await this.prisma.$executeRawUnsafe('TRUNCATE TABLE "ndc_hcpcs_crosswalk" RESTART IDENTITY');
    }

    const ext = path.extname(filePath).toLowerCase();
    let result: NdcHcpcsCrosswalkImportResult;

    if (ext === '.json') {
      result = await this.importFromJson(filePath);
    } else if (ext === '.xlsx' || ext === '.xls') {
      result = await this.importFromExcel(filePath, options);
    } else {
      throw new Error('Unsupported file type. Use .xlsx, .xls, or .json');
    }

    if (result.errors === 0 && result.invalidNdc === 0) {
      await this.lookupSync.syncTable('ndc_hcpcs_crosswalk');
    }

    return result;
  }

  private pairKey(ndc: string, hcpcs: string): string {
    return `${ndc}|${hcpcs.toUpperCase()}`;
  }

  private async loadExistingKeys(): Promise<void> {
    if (this.existingKeys !== null) {
      return;
    }
    this.existingKeys = new Map();
    const rows = await this.prisma.ndcHcpcsCrosswalk.findMany({
      select: { ndc: true, hcpcs: true },
      orderBy: { id: 'asc' },
    });
    for (const row of rows) {
      this.existingKeys.set(this.pairKey(row.ndc, row.hcpcs), true);
    }
  }

  private pairExists(ndc: string, hcpcs: string): boolean {
    return this.existingKeys?.has(this.pairKey(ndc, hcpcs)) ?? false;
  }

  private normalizeImportNdcDigits(raw: string): string | null {
    const normalized = normalizeNdcFromImport(raw);
    return normalized?.ndcDigits ?? null;
  }

  private async importFromExcel(
    filePath: string,
    options: CodeListImportOptions,
  ): Promise<NdcHcpcsCrosswalkImportResult> {
    const chunkSize = Math.max(1, options.chunk ?? 500);
    const rows = await loadExcelRowsWithHeaderWorksheet(filePath);
    if (rows.length === 0) {
      throw new Error('Excel file is empty.');
    }

    const headers = (rows[0] ?? []).map((header) => normalizeHeader(String(header ?? '')));
    const columnMap = mapNdcHcpcsCrosswalkExcelColumns(headers);
    if (columnMap.ndc === undefined || columnMap.hcpcs === undefined) {
      throw new Error('Could not find required columns. Expected NDC and HCPCS columns.');
    }

    await this.loadExistingKeys();

    let imported = 0;
    let skipped = 0;
    let skippedExisting = 0;
    let invalidNdc = 0;
    const errors = 0;
    let batch: CrosswalkRow[] = [];

    for (const row of rows.slice(1)) {
      const ndcRaw = getMappedColumnValue(row, columnMap, 'ndc');
      const hcpcsRaw = getMappedColumnValue(row, columnMap, 'hcpcs');
      if (ndcRaw === null || hcpcsRaw === null) {
        skipped += 1;
        continue;
      }

      const hcpcs = hcpcsRaw.trim();
      const ndcDigits = this.normalizeImportNdcDigits(ndcRaw.trim());
      if (ndcDigits === null) {
        invalidNdc += 1;
        continue;
      }

      if (this.pairExists(ndcDigits, hcpcs)) {
        skippedExisting += 1;
        continue;
      }

      batch.push({
        ndc: ndcDigits,
        hcpcs,
        ndcLabel: getMappedColumnValue(row, columnMap, 'ndc_label'),
        hcpcsAmount: parseImportOptionalFloat(getMappedColumnValue(row, columnMap, 'hcpcs_amount')),
        hcpcsMeasure: getMappedColumnValue(row, columnMap, 'hcpcs_measure'),
        packageItemCount: parseImportOptionalInteger(
          getMappedColumnValue(row, columnMap, 'package_item_count'),
        ),
        isActive: true,
      });

      if (batch.length >= chunkSize) {
        imported += await this.persistBatch(batch);
        batch = [];
      }
    }

    if (batch.length > 0) {
      imported += await this.persistBatch(batch);
    }

    return { imported, skippedExisting, skipped, invalidNdc, errors };
  }

  private async importFromJson(filePath: string): Promise<NdcHcpcsCrosswalkImportResult> {
    const chunkSize = 1000;
    const content = readFileSync(filePath, 'utf8');
    const data = JSON.parse(content) as { crosswalk?: CrosswalkJson[] } | CrosswalkJson[];
    const records = Array.isArray(data) ? data : (data.crosswalk ?? []);

    await this.loadExistingKeys();

    let imported = 0;
    let skippedExisting = 0;
    let invalidNdc = 0;
    let errors = 0;
    let batch: CrosswalkRow[] = [];

    for (const recordData of records) {
      if (!recordData.ndc || !recordData.hcpcs) {
        errors += 1;
        continue;
      }

      const hcpcs = String(recordData.hcpcs).trim();
      const ndcDigits = this.normalizeImportNdcDigits(String(recordData.ndc).trim());
      if (ndcDigits === null) {
        invalidNdc += 1;
        continue;
      }

      if (this.pairExists(ndcDigits, hcpcs)) {
        skippedExisting += 1;
        continue;
      }

      batch.push({
        ndc: ndcDigits,
        hcpcs,
        ndcLabel: recordData.ndc_label ?? null,
        hcpcsAmount: parseImportOptionalFloat(
          recordData.hcpcs_amount === undefined || recordData.hcpcs_amount === null
            ? null
            : String(recordData.hcpcs_amount),
        ),
        hcpcsMeasure: recordData.hcpcs_measure ?? null,
        packageItemCount: parseImportOptionalInteger(
          recordData.package_item_count === undefined || recordData.package_item_count === null
            ? null
            : String(recordData.package_item_count),
        ),
        isActive: recordData.is_active ?? true,
      });

      if (batch.length >= chunkSize) {
        imported += await this.persistBatch(batch);
        batch = [];
      }
    }

    if (batch.length > 0) {
      imported += await this.persistBatch(batch);
    }

    return { imported, skippedExisting, skipped: 0, invalidNdc, errors };
  }

  private dedupeByNdcAndHcpcs(batch: CrosswalkRow[]): CrosswalkRow[] {
    const unique = new Map<string, CrosswalkRow>();
    for (const row of batch) {
      if (row.ndc === '' || row.hcpcs === '') {
        continue;
      }
      unique.set(`${row.ndc}|${row.hcpcs}`, row);
    }
    return [...unique.values()];
  }

  private async persistBatch(batch: CrosswalkRow[]): Promise<number> {
    const unique = this.dedupeByNdcAndHcpcs(batch);
    if (unique.length === 0) {
      return 0;
    }

    await this.prisma.ndcHcpcsCrosswalk.createMany({
      data: unique.map((row) => ({
        ndc: row.ndc,
        hcpcs: row.hcpcs,
        ndcLabel: row.ndcLabel,
        hcpcsAmount: row.hcpcsAmount === null ? null : new Prisma.Decimal(row.hcpcsAmount),
        hcpcsMeasure: row.hcpcsMeasure,
        packageItemCount: row.packageItemCount,
        isActive: row.isActive,
      })),
    });

    for (const row of unique) {
      this.existingKeys?.set(this.pairKey(row.ndc, row.hcpcs), true);
    }

    return unique.length;
  }
}

interface CrosswalkJson {
  ndc?: string;
  hcpcs?: string;
  ndc_label?: string;
  hcpcs_amount?: number | string;
  hcpcs_measure?: string;
  package_item_count?: number | string;
  is_active?: boolean;
}
