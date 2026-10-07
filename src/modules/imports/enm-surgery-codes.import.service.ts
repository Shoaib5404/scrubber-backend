import { Injectable } from '@nestjs/common';
import * as path from 'path';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { CodeListImportOptions, CodeListImportResult } from './import.types';
import {
  dedupeBatchByKey,
  getMappedColumnValue,
  loadExcelRows,
  mapEnmSurgeryCodeExcelColumns,
  normalizeHeader,
  parseAlphanumericCode,
} from './import.utils';
import { LookupSyncHelper } from './lookup-sync.helper';

@Injectable()
export class EnmSurgeryCodesImportService {
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
      await this.prisma.$executeRawUnsafe(
        'TRUNCATE TABLE "enm_surgery_codes" RESTART IDENTITY',
      );
    }

    const rows = await loadExcelRows(filePath);
    if (rows.length === 0) {
      throw new Error('Excel file is empty.');
    }

    const headers = (rows[0] ?? []).map((header) => normalizeHeader(String(header ?? '')));
    let columnMap = mapEnmSurgeryCodeExcelColumns(headers);
    if (columnMap.cptCode === undefined) {
      if (headers.length === 1) {
        columnMap = { cptCode: 0 };
      } else {
        throw new Error(
          'Could not find CPT code column. Expected one of: E&MCodes, cpt, cpt_code, code',
        );
      }
    }

    let upserted = 0;
    let skipped = 0;
    let batch: { cptCode: string }[] = [];

    for (const row of rows.slice(1)) {
      const cptCode = parseAlphanumericCode(getMappedColumnValue(row, columnMap, 'cptCode'));
      if (cptCode === null) {
        skipped += 1;
        continue;
      }

      batch.push({ cptCode });
      if (batch.length >= chunkSize) {
        upserted += await this.upsertBatch(batch);
        batch = [];
      }
    }

    if (batch.length > 0) {
      upserted += await this.upsertBatch(batch);
    }

    await this.lookupSync.syncTable('enm_surgery_codes');
    return { upserted, skipped };
  }

  private async upsertBatch(batch: { cptCode: string }[]): Promise<number> {
    const unique = dedupeBatchByKey(batch, 'cptCode');
    await this.prisma.$transaction(
      unique.map((row) =>
        this.prisma.enmSurgeryCode.upsert({
          where: { cptCode: row.cptCode },
          create: { cptCode: row.cptCode, isActive: true },
          update: { isActive: true },
        }),
      ),
    );
    return unique.length;
  }
}
