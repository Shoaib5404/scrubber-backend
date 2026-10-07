import { Injectable } from '@nestjs/common';
import * as path from 'path';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { CodeListImportOptions, CodeListImportResult } from './import.types';
import {
  getMappedColumnValue,
  loadExcelRows,
  mapConsultationProcedureExcelColumns,
  normalizeHeader,
} from './import.utils';
import { LookupSyncHelper } from './lookup-sync.helper';

@Injectable()
export class ConsultationProceduresImportService {
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
        'TRUNCATE TABLE "consultation_procedures" RESTART IDENTITY',
      );
    }

    const rows = await loadExcelRows(filePath);
    if (rows.length === 0) {
      throw new Error('Excel file is empty.');
    }

    const headers = (rows[0] ?? []).map((header) => normalizeHeader(String(header ?? '')));
    const columnMap = mapConsultationProcedureExcelColumns(headers);
    if (columnMap.cptCode === undefined) {
      throw new Error(
        'Could not find CPT code column. Expected one of: cpt, cpt_code, code, procedure_code',
      );
    }

    let upserted = 0;
    let skipped = 0;
    let batch: {
      cptCode: string;
      description: string | null;
      typeOfService: string | null;
    }[] = [];

    for (const row of rows.slice(1)) {
      const cptCode = getMappedColumnValue(row, columnMap, 'cptCode');
      if (cptCode === null) {
        skipped += 1;
        continue;
      }

      batch.push({
        cptCode,
        description: getMappedColumnValue(row, columnMap, 'description'),
        typeOfService: getMappedColumnValue(row, columnMap, 'typeOfService'),
      });

      if (batch.length >= chunkSize) {
        upserted += await this.upsertBatch(batch);
        batch = [];
      }
    }

    if (batch.length > 0) {
      upserted += await this.upsertBatch(batch);
    }

    await this.lookupSync.syncTable('consultation_procedures');
    return { upserted, skipped };
  }

  private dedupeByCptCode(
    batch: {
      cptCode: string;
      description: string | null;
      typeOfService: string | null;
    }[],
  ): typeof batch {
    const unique = new Map<string, (typeof batch)[number]>();
    for (const row of batch) {
      unique.set(row.cptCode, row);
    }
    return [...unique.values()];
  }

  private async upsertBatch(
    batch: {
      cptCode: string;
      description: string | null;
      typeOfService: string | null;
    }[],
  ): Promise<number> {
    const unique = this.dedupeByCptCode(batch);
    await this.prisma.$transaction(
      unique.map((row) =>
        this.prisma.consultationProcedure.upsert({
          where: { cptCode: row.cptCode },
          create: {
            cptCode: row.cptCode,
            description: row.description,
            typeOfService: row.typeOfService,
            isActive: true,
          },
          update: {
            description: row.description,
            typeOfService: row.typeOfService,
            isActive: true,
          },
        }),
      ),
    );
    return unique.length;
  }
}
