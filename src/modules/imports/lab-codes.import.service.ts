import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as path from 'path';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { CodeListImportOptions, CodeListImportResult } from './import.types';
import {
  getMappedColumnValue,
  loadExcelRows,
  mapLabCodeExcelColumns,
  normalizeHeader,
  nullableTrim,
  parseAlphanumericCode,
  parseLabEffectiveDate,
  parseLabModifier,
  parseLabRate,
} from './import.utils';
import { LookupSyncHelper } from './lookup-sync.helper';

interface LabCodeRow {
  hcpcs: string;
  modifier: string;
  effectiveDate: Date | null;
  indicator: string | null;
  rate: string | null;
  shortDescription: string | null;
}

@Injectable()
export class LabCodesImportService {
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

    const chunkSize = Math.max(1, options.chunk ?? 500);

    if (options.truncate) {
      await this.prisma.$executeRawUnsafe('TRUNCATE TABLE "lab_codes" RESTART IDENTITY');
    }

    const rows = await loadExcelRows(filePath);
    if (rows.length === 0) {
      throw new Error('Excel file is empty.');
    }

    const headers = (rows[0] ?? []).map((header) => normalizeHeader(String(header ?? '')));
    const columnMap = mapLabCodeExcelColumns(headers);
    if (columnMap.hcpcs === undefined) {
      throw new Error('Could not find HCPCS column. Expected one of: hcpcs, code, cpt, cpt_code');
    }

    let upserted = 0;
    let skipped = 0;
    let batch: LabCodeRow[] = [];

    for (const row of rows.slice(1)) {
      const hcpcs = parseAlphanumericCode(getMappedColumnValue(row, columnMap, 'hcpcs'));
      if (hcpcs === null) {
        skipped += 1;
        continue;
      }

      batch.push({
        hcpcs,
        modifier: parseLabModifier(getMappedColumnValue(row, columnMap, 'modifier')),
        effectiveDate: parseLabEffectiveDate(getMappedColumnValue(row, columnMap, 'effectiveDate')),
        indicator: nullableTrim(getMappedColumnValue(row, columnMap, 'indicator')),
        rate: parseLabRate(getMappedColumnValue(row, columnMap, 'rate')),
        shortDescription: nullableTrim(getMappedColumnValue(row, columnMap, 'shortDescription')),
      });

      if (batch.length >= chunkSize) {
        upserted += await this.upsertBatch(batch);
        batch = [];
      }
    }

    if (batch.length > 0) {
      upserted += await this.upsertBatch(batch);
    }

    await this.lookupSync.syncTable('lab_codes');
    return { upserted, skipped };
  }

  private dedupeBatch(batch: LabCodeRow[]): LabCodeRow[] {
    const unique = new Map<string, LabCodeRow>();
    for (const row of batch) {
      unique.set(`${row.hcpcs}|${row.modifier}`, row);
    }
    return [...unique.values()];
  }

  private async upsertBatch(batch: LabCodeRow[]): Promise<number> {
    const unique = this.dedupeBatch(batch);
    await this.prisma.$transaction(
      unique.map((row) =>
        this.prisma.labCode.upsert({
          where: {
            hcpcs_modifier: {
              hcpcs: row.hcpcs,
              modifier: row.modifier,
            },
          },
          create: {
            hcpcs: row.hcpcs,
            modifier: row.modifier,
            effectiveDate: row.effectiveDate,
            indicator: row.indicator,
            rate: row.rate === null ? null : new Prisma.Decimal(row.rate),
            shortDescription: row.shortDescription,
            isActive: true,
          },
          update: {
            effectiveDate: row.effectiveDate,
            indicator: row.indicator,
            rate: row.rate === null ? null : new Prisma.Decimal(row.rate),
            shortDescription: row.shortDescription,
            isActive: true,
          },
        }),
      ),
    );
    return unique.length;
  }
}
