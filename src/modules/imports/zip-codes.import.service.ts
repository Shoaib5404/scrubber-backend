import { Injectable } from '@nestjs/common';
import * as path from 'path';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  loadExcelRows,
  mapZipCodeExcelColumns,
  normalizeHeader,
  normalizeZip,
  normalizeZipCodeType,
  normalizeZipState,
  nullableTrim,
  parseCsvFile,
} from './import.utils';
import { LookupSyncHelper } from './lookup-sync.helper';

export interface ZipCodesImportOptions {
  truncate?: boolean;
  chunk?: number;
}

export interface ZipCodesImportResult {
  imported: number;
  skipped: number;
}

interface ZipCodeRow {
  zipCode: string;
  zipCodeType: string | null;
  city: string;
  stateName: string | null;
  state: string;
  isActive: boolean;
}

/** Laravel App\Console\Commands\ImportZipCodes (zip:import-codes). */
@Injectable()
export class ZipCodesImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lookupSync: LookupSyncHelper,
  ) {}

  async importFromFile(
    filePath: string,
    options: ZipCodesImportOptions = {},
  ): Promise<ZipCodesImportResult> {
    const chunkSize = Math.max(100, options.chunk ?? 1000);

    if (options.truncate) {
      await this.prisma.$executeRawUnsafe('TRUNCATE TABLE "zip_codes" RESTART IDENTITY');
    }

    const ext = path.extname(filePath).toLowerCase();
    let result: ZipCodesImportResult;

    if (ext === '.xlsx' || ext === '.xls') {
      result = await this.importFromExcel(filePath, chunkSize);
    } else if (ext === '.csv') {
      result = await this.importFromCsv(filePath, chunkSize);
    } else {
      throw new Error('Unsupported file type. Use .xlsx or .csv');
    }

    await this.lookupSync.syncTable('zip_codes');

    return result;
  }

  private resolveColumnMap(headerRow: string[]): Partial<
    Record<'zip_code' | 'zip_code_type' | 'city' | 'state_name' | 'state', number>
  > {
    const headers = headerRow.map((header) => normalizeHeader(String(header ?? '')));
    return mapZipCodeExcelColumns(headers);
  }

  private async importFromExcel(filePath: string, chunkSize: number): Promise<ZipCodesImportResult> {
    const rows = await loadExcelRows(filePath);
    if (rows.length === 0) {
      throw new Error('Excel file is empty.');
    }

    const columnMap = this.resolveColumnMap(rows[0] ?? []);
    if (
      columnMap.zip_code === undefined ||
      columnMap.city === undefined ||
      columnMap.state === undefined
    ) {
      throw new Error('Could not find required columns: vZIPCode, vCity, vState.');
    }

    return this.processRows(rows.slice(1), columnMap, chunkSize);
  }

  private async importFromCsv(filePath: string, chunkSize: number): Promise<ZipCodesImportResult> {
    const rows = parseCsvFile(filePath);
    if (rows.length === 0) {
      throw new Error('CSV file is empty.');
    }

    const columnMap = this.resolveColumnMap(rows[0] ?? []);
    if (
      columnMap.zip_code === undefined ||
      columnMap.city === undefined ||
      columnMap.state === undefined
    ) {
      throw new Error('Could not find required columns: vZIPCode, vCity, vState.');
    }

    return this.processRows(rows.slice(1), columnMap, chunkSize);
  }

  private async processRows(
    dataRows: string[][],
    columnMap: Partial<Record<'zip_code' | 'zip_code_type' | 'city' | 'state_name' | 'state', number>>,
    chunkSize: number,
  ): Promise<ZipCodesImportResult> {
    let imported = 0;
    let skipped = 0;
    const seen = new Set<string>();
    let batch: ZipCodeRow[] = [];

    for (const row of dataRows) {
      const record = this.buildRecord(row, columnMap, seen);
      if (record === null) {
        skipped += 1;
        continue;
      }

      batch.push(record);

      if (batch.length >= chunkSize) {
        imported += await this.persistBatch(batch);
        batch = [];
      }
    }

    if (batch.length > 0) {
      imported += await this.persistBatch(batch);
    }

    return { imported, skipped };
  }

  private column(
    row: string[],
    columnMap: Partial<Record<string, number>>,
    field: string,
  ): string | null {
    const index = columnMap[field];
    if (index === undefined || index < 0 || index >= row.length) {
      return null;
    }
    const value = (row[index] ?? '').trim();
    return value === '' ? null : value;
  }

  private buildRecord(
    row: string[],
    columnMap: Partial<Record<'zip_code' | 'zip_code_type' | 'city' | 'state_name' | 'state', number>>,
    seen: Set<string>,
  ): ZipCodeRow | null {
    const zipCode = normalizeZip(this.column(row, columnMap, 'zip_code'));
    const city = nullableTrim(this.column(row, columnMap, 'city'));
    const state = normalizeZipState(this.column(row, columnMap, 'state'));

    if (zipCode === null || city === null || state === null) {
      return null;
    }

    const key = `${zipCode}|${city}|${state}`;
    if (seen.has(key)) {
      return null;
    }
    seen.add(key);

    return {
      zipCode,
      zipCodeType: normalizeZipCodeType(this.column(row, columnMap, 'zip_code_type')),
      city,
      stateName: nullableTrim(this.column(row, columnMap, 'state_name')),
      state,
      isActive: true,
    };
  }

  private dedupeBatch(batch: ZipCodeRow[]): ZipCodeRow[] {
    const unique = new Map<string, ZipCodeRow>();
    for (const row of batch) {
      unique.set(`${row.zipCode}|${row.city}|${row.state}`, row);
    }
    return [...unique.values()];
  }

  private async persistBatch(batch: ZipCodeRow[]): Promise<number> {
    const records = this.dedupeBatch(batch);
    if (records.length === 0) {
      return 0;
    }

    await this.prisma.$transaction(
      records.map((row) =>
        this.prisma.zipCode.upsert({
          where: {
            zipCode_city_state: { zipCode: row.zipCode, city: row.city, state: row.state },
          },
          create: {
            zipCode: row.zipCode,
            zipCodeType: row.zipCodeType,
            city: row.city,
            stateName: row.stateName,
            state: row.state,
            isActive: row.isActive,
          },
          update: {
            zipCodeType: row.zipCodeType,
            stateName: row.stateName,
            isActive: row.isActive,
          },
        }),
      ),
    );
    return records.length;
  }
}
