import { Injectable } from '@nestjs/common';
import { readFileSync } from 'fs';
import * as path from 'path';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { CodeListImportOptions, CodeListImportResult } from './import.types';
import {
  getMappedColumnValue,
  loadExcelRows,
  mapCptDescriptionExcelColumns,
  normalizeHeader,
} from './import.utils';
import { LookupSyncHelper } from './lookup-sync.helper';

interface EnmProcedureRow {
  cptCode: string;
  description: string | null;
  isActive: boolean;
}

@Injectable()
export class EnmProceduresImportService {
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
        'TRUNCATE TABLE "enm_procedures" RESTART IDENTITY',
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
    const columnMap = mapCptDescriptionExcelColumns(headers);
    if (columnMap.cptCode === undefined) {
      throw new Error(
        'Could not find CPT code column. Expected one of: cpt, cpt_code, code, procedure_code',
      );
    }

    let upserted = 0;
    let skipped = 0;
    let batch: EnmProcedureRow[] = [];

    for (const row of rows.slice(1)) {
      const cptCode = getMappedColumnValue(row, columnMap, 'cptCode');
      if (cptCode === null) {
        skipped += 1;
        continue;
      }

      batch.push({
        cptCode,
        description: getMappedColumnValue(row, columnMap, 'description'),
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

    await this.lookupSync.syncTable('enm_procedures');
    return { upserted, skipped };
  }

  private async importFromJson(filePath: string): Promise<CodeListImportResult> {
    const content = readFileSync(filePath, 'utf8');
    const data = JSON.parse(content) as
      | { procedures?: EnmProcedureJson[] }
      | EnmProcedureJson[];
    const procedures = Array.isArray(data) ? data : (data.procedures ?? []);

    let upserted = 0;
    let skipped = 0;
    let batch: EnmProcedureRow[] = [];
    const chunkSize = 1000;

    for (const procedureData of procedures) {
      const cptCode = procedureData.cpt_code?.trim() ?? '';
      if (cptCode === '') {
        skipped += 1;
        continue;
      }

      batch.push({
        cptCode,
        description: procedureData.description ?? null,
        isActive: procedureData.is_active ?? true,
      });

      if (batch.length >= chunkSize) {
        upserted += await this.upsertBatch(batch);
        batch = [];
      }
    }

    if (batch.length > 0) {
      upserted += await this.upsertBatch(batch);
    }

    await this.lookupSync.syncTable('enm_procedures');
    return { upserted, skipped };
  }

  private dedupeByCptCode(batch: EnmProcedureRow[]): EnmProcedureRow[] {
    const unique = new Map<string, EnmProcedureRow>();
    for (const row of batch) {
      unique.set(row.cptCode, row);
    }
    return [...unique.values()];
  }

  private async upsertBatch(batch: EnmProcedureRow[]): Promise<number> {
    const unique = this.dedupeByCptCode(batch);
    await this.prisma.$transaction(
      unique.map((row) =>
        this.prisma.enmProcedure.upsert({
          where: { cptCode: row.cptCode },
          create: {
            cptCode: row.cptCode,
            description: row.description,
            isActive: row.isActive,
          },
          update: {
            description: row.description,
            isActive: row.isActive,
          },
        }),
      ),
    );
    return unique.length;
  }
}

interface EnmProcedureJson {
  cpt_code?: string;
  description?: string | null;
  is_active?: boolean;
}
