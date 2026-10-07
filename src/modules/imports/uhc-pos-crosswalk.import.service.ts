import { Injectable } from '@nestjs/common';
import { readFileSync } from 'fs';
import * as path from 'path';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { CodeListImportOptions } from './import.types';
import {
  findUhcPosCrosswalkHeaderRowIndex,
  getMappedColumnValue,
  loadExcelRows,
  mapUhcPosCrosswalkExcelColumns,
  normalizeHeader,
  normalizeUhcPosCode,
} from './import.utils';
import { LookupSyncHelper } from './lookup-sync.helper';

export interface UhcPosCrosswalkImportResult {
  imported: number;
  updated: number;
  skipped: number;
  errors: number;
}

interface UhcPosRow {
  cptCode: string;
  posCode: string;
  isActive: boolean;
}

@Injectable()
export class UhcPosCrosswalkImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lookupSync: LookupSyncHelper,
  ) {}

  async importFromFile(
    filePath: string,
    options: CodeListImportOptions = {},
  ): Promise<UhcPosCrosswalkImportResult> {
    if (options.truncate) {
      await this.prisma.$executeRawUnsafe('TRUNCATE TABLE "uhc_pos_crosswalk" RESTART IDENTITY');
    }

    const ext = path.extname(filePath).toLowerCase();
    let result: UhcPosCrosswalkImportResult;

    if (ext === '.json') {
      result = await this.importFromJson(filePath);
    } else if (ext === '.xlsx' || ext === '.xls') {
      result = await this.importFromExcel(filePath, options);
    } else {
      throw new Error('Unsupported file type. Use .xlsx, .xls, or .json');
    }

    if (result.errors === 0) {
      await this.lookupSync.syncTable('uhc_pos_crosswalk');
    }

    return result;
  }

  private async importFromExcel(
    filePath: string,
    options: CodeListImportOptions,
  ): Promise<UhcPosCrosswalkImportResult> {
    const chunkSize = Math.max(1, options.chunk ?? 500);
    const rows = await loadExcelRows(filePath);
    if (rows.length === 0) {
      throw new Error('Excel file is empty.');
    }

    const headerRowIndex = findUhcPosCrosswalkHeaderRowIndex(rows);
    const headers = (rows[headerRowIndex] ?? []).map((header) => normalizeHeader(String(header ?? '')));
    const columnMap = mapUhcPosCrosswalkExcelColumns(headers);
    if (columnMap.cpt_code === undefined || columnMap.pos_code === undefined) {
      throw new Error('Could not find required columns. Expected CPT and POS columns.');
    }

    let imported = 0;
    let updated = 0;
    let skipped = 0;
    const errors = 0;
    let batch: UhcPosRow[] = [];

    for (const row of rows.slice(headerRowIndex + 1)) {
      const cptCode = getMappedColumnValue(row, columnMap, 'cpt_code');
      const posRaw = getMappedColumnValue(row, columnMap, 'pos_code');
      if (cptCode === null || posRaw === null) {
        skipped += 1;
        continue;
      }

      const posCode = normalizeUhcPosCode(posRaw);
      if (posCode === null) {
        skipped += 1;
        continue;
      }

      batch.push({
        cptCode: cptCode.trim(),
        posCode,
        isActive: true,
      });

      if (batch.length >= chunkSize) {
        const counts = await this.persistBatch(batch);
        imported += counts.imported;
        updated += counts.updated;
        batch = [];
      }
    }

    if (batch.length > 0) {
      const counts = await this.persistBatch(batch);
      imported += counts.imported;
      updated += counts.updated;
    }

    return { imported, updated, skipped, errors };
  }

  private async importFromJson(filePath: string): Promise<UhcPosCrosswalkImportResult> {
    const chunkSize = 1000;
    const content = readFileSync(filePath, 'utf8');
    const data = JSON.parse(content) as { crosswalk?: UhcPosJson[] } | UhcPosJson[];
    const records = Array.isArray(data) ? data : (data.crosswalk ?? []);

    let imported = 0;
    let updated = 0;
    let errors = 0;
    let batch: UhcPosRow[] = [];

    for (const recordData of records) {
      if (!recordData.cpt_code || recordData.pos_code === undefined) {
        errors += 1;
        continue;
      }

      const posCode = normalizeUhcPosCode(String(recordData.pos_code));
      if (posCode === null) {
        errors += 1;
        continue;
      }

      batch.push({
        cptCode: String(recordData.cpt_code).trim(),
        posCode,
        isActive: recordData.is_active ?? true,
      });

      if (batch.length >= chunkSize) {
        const counts = await this.persistBatch(batch);
        imported += counts.imported;
        updated += counts.updated;
        batch = [];
      }
    }

    if (batch.length > 0) {
      const counts = await this.persistBatch(batch);
      imported += counts.imported;
      updated += counts.updated;
    }

    return { imported, updated, skipped: 0, errors };
  }

  private dedupeByCptAndPos(batch: UhcPosRow[]): UhcPosRow[] {
    const unique = new Map<string, UhcPosRow>();
    for (const row of batch) {
      const posCode = normalizeUhcPosCode(row.posCode);
      if (row.cptCode.trim() === '' || posCode === null) {
        continue;
      }
      unique.set(`${row.cptCode.trim()}|${posCode}`, {
        cptCode: row.cptCode.trim(),
        posCode,
        isActive: row.isActive,
      });
    }
    return [...unique.values()];
  }

  private async persistBatch(batch: UhcPosRow[]): Promise<{ imported: number; updated: number }> {
    const unique = this.dedupeByCptAndPos(batch);
    await this.prisma.$transaction(
      unique.map((row) =>
        this.prisma.uhcPosCrosswalk.upsert({
          where: {
            cptCode_posCode: {
              cptCode: row.cptCode,
              posCode: row.posCode,
            },
          },
          create: {
            cptCode: row.cptCode,
            posCode: row.posCode,
            isActive: row.isActive,
          },
          update: {
            isActive: row.isActive,
          },
        }),
      ),
    );
    return { imported: 0, updated: unique.length };
  }
}

interface UhcPosJson {
  cpt_code?: string;
  pos_code?: string | number;
  is_active?: boolean;
}
