import { Injectable } from '@nestjs/common';
import * as path from 'path';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { CodeListImportOptions, CodeListImportResult } from './import.types';
import {
  getMappedColumnValue,
  loadExcelRows,
  mapVaccineCodeExcelColumns,
  normalizeHeader,
  nullableTrim,
  parseAlphanumericCode,
  parseVaccineComponentCount,
} from './import.utils';
import { LookupSyncHelper } from './lookup-sync.helper';

@Injectable()
export class VaccineCodesImportService {
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
      await this.prisma.$executeRawUnsafe('TRUNCATE TABLE "vaccine_codes" RESTART IDENTITY');
    }

    const rows = await loadExcelRows(filePath);
    if (rows.length === 0) {
      throw new Error('Excel file is empty.');
    }

    const headers = (rows[0] ?? []).map((header) => normalizeHeader(String(header ?? '')));
    const columnMap = mapVaccineCodeExcelColumns(headers);
    if (columnMap.vaccineCode === undefined) {
      throw new Error(
        'Could not find Vaccine Code column. Expected one of: vaccine_code, code, cpt, hcpcs',
      );
    }

    let upserted = 0;
    let skipped = 0;
    let batch: {
      vaccineCode: string;
      description: string | null;
      componentCount: number | null;
    }[] = [];

    for (const row of rows.slice(1)) {
      const vaccineCode = parseAlphanumericCode(
        getMappedColumnValue(row, columnMap, 'vaccineCode'),
      );
      if (vaccineCode === null) {
        skipped += 1;
        continue;
      }

      batch.push({
        vaccineCode,
        description: nullableTrim(getMappedColumnValue(row, columnMap, 'description')),
        componentCount: parseVaccineComponentCount(
          getMappedColumnValue(row, columnMap, 'componentCount'),
        ),
      });

      if (batch.length >= chunkSize) {
        upserted += await this.upsertBatch(batch);
        batch = [];
      }
    }

    if (batch.length > 0) {
      upserted += await this.upsertBatch(batch);
    }

    await this.lookupSync.syncTable('vaccine_codes');
    return { upserted, skipped };
  }

  private dedupeByVaccineCode(
    batch: {
      vaccineCode: string;
      description: string | null;
      componentCount: number | null;
    }[],
  ): typeof batch {
    const unique = new Map<string, (typeof batch)[number]>();
    for (const row of batch) {
      unique.set(row.vaccineCode, row);
    }
    return [...unique.values()];
  }

  private async upsertBatch(
    batch: {
      vaccineCode: string;
      description: string | null;
      componentCount: number | null;
    }[],
  ): Promise<number> {
    const unique = this.dedupeByVaccineCode(batch);
    await this.prisma.$transaction(
      unique.map((row) =>
        this.prisma.vaccineCode.upsert({
          where: { vaccineCode: row.vaccineCode },
          create: {
            vaccineCode: row.vaccineCode,
            description: row.description,
            componentCount: row.componentCount,
            isActive: true,
          },
          update: {
            description: row.description,
            componentCount: row.componentCount,
            isActive: true,
          },
        }),
      ),
    );
    return unique.length;
  }
}
