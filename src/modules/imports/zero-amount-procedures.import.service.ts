import { Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import * as path from 'path';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { CodeListImportOptions, CodeListImportResult } from './import.types';
import {
  dedupeBatchByKey,
  mapZeroAmountProcedureColumn,
  normalizeHeader,
  parseZeroAmountProcedureCode,
} from './import.utils';
import { LookupSyncHelper } from './lookup-sync.helper';

@Injectable()
export class ZeroAmountProceduresImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lookupSync: LookupSyncHelper,
  ) {}

  async importFromFile(
    filePath: string,
    options: CodeListImportOptions = {},
  ): Promise<CodeListImportResult> {
    const chunkSize = Math.max(1, options.chunk ?? 500);
    const ext = path.extname(filePath).toLowerCase();
    if (ext !== '.xlsx' && ext !== '.xls') {
      throw new Error('Unsupported file type. Use .xlsx or .xls');
    }

    if (options.truncate) {
      await this.prisma.$executeRawUnsafe(
        'TRUNCATE TABLE "zero_amount_procedures" RESTART IDENTITY',
      );
    }

    const rows = await this.loadExcelRows(filePath);
    if (rows.length === 0) {
      throw new Error('Excel file is empty.');
    }

    const headers = (rows[0] ?? []).map((header) => normalizeHeader(String(header ?? '')));
    const procedureCodeCol = mapZeroAmountProcedureColumn(headers);
    if (procedureCodeCol === null) {
      throw new Error(
        'Could not find ProcedureCode column. Expected one of: procedure_code, procedurecode, code, cpt, hcpcs',
      );
    }

    let upserted = 0;
    let skipped = 0;
    let batch: { procedureCode: string }[] = [];

    for (const row of rows.slice(1)) {
      const raw = row[procedureCodeCol] ?? null;
      const procedureCode = parseZeroAmountProcedureCode(
        raw === null || raw === undefined ? null : String(raw),
      );
      if (procedureCode === null) {
        skipped += 1;
        continue;
      }

      batch.push({ procedureCode });
      if (batch.length >= chunkSize) {
        upserted += await this.upsertBatch(batch);
        batch = [];
      }
    }

    if (batch.length > 0) {
      upserted += await this.upsertBatch(batch);
    }

    await this.lookupSync.syncTable('zero_amount_procedures');

    return { upserted, skipped };
  }

  private async loadExcelRows(filePath: string): Promise<string[][]> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    const sheet = workbook.worksheets[0];
    if (!sheet) {
      return [];
    }

    const rows: string[][] = [];
    sheet.eachRow((row) => {
      const values = row.values;
      if (!Array.isArray(values)) {
        return;
      }
      const cells = values.slice(1).map((value) => {
        if (value === null || value === undefined) {
          return '';
        }
        return String(value).trim();
      });
      rows.push(cells);
    });
    return rows;
  }

  private async upsertBatch(batch: { procedureCode: string }[]): Promise<number> {
    const unique = dedupeBatchByKey(batch, 'procedureCode');
    await this.prisma.$transaction(
      unique.map((row) =>
        this.prisma.zeroAmountProcedure.upsert({
          where: { procedureCode: row.procedureCode },
          create: {
            procedureCode: row.procedureCode,
            isActive: true,
          },
          update: {
            isActive: true,
          },
        }),
      ),
    );
    return unique.length;
  }
}
