import { Injectable } from '@nestjs/common';
import { readFileSync } from 'fs';
import * as path from 'path';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  CIGNA_CPT_SHEET_NAMES,
  CIGNA_HCPCS_HEADER_ALIASES,
  CIGNA_ICD_HEADER_ALIASES,
  CIGNA_ICD_SHEET_NAMES,
  expandCignaIcdCell,
  extractSingleColumnCodes,
  findHeaderRowIndexByFirstColumn,
  loadExcelWorkbook,
  resolveWorksheetByPreferredNames,
  worksheetToRows,
} from './import.utils';
import { LookupSyncHelper } from './lookup-sync.helper';

export interface CignaCptIcdCrosswalkImportOptions {
  truncate?: boolean;
  chunk?: number;
  noWarm?: boolean;
}

export interface CignaCptIcdCrosswalkImportResult {
  imported: number;
  updated: number;
  skipped: number;
  errors: number;
}

interface CrosswalkRow {
  cptCode: string;
  icdCode: string;
  isActive: boolean;
}

interface CrosswalkJson {
  cpt_code?: string;
  icd_code?: string;
  is_active?: boolean;
}

/** Laravel App\Console\Commands\ImportCignaCptIcdCrosswalk (cigna:import-cpt-icd-crosswalk). */
@Injectable()
export class CignaCptIcdCrosswalkImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lookupSync: LookupSyncHelper,
  ) {}

  async importFromFile(
    filePath: string,
    options: CignaCptIcdCrosswalkImportOptions = {},
  ): Promise<CignaCptIcdCrosswalkImportResult> {
    if (options.truncate) {
      await this.prisma.$executeRawUnsafe(
        'TRUNCATE TABLE "cigna_cpt_icd_crosswalk" RESTART IDENTITY',
      );
    }

    const ext = path.extname(filePath).toLowerCase();
    let result: CignaCptIcdCrosswalkImportResult;

    if (ext === '.xlsx' || ext === '.xls') {
      result = await this.importFromExcel(filePath, options);
    } else if (ext === '.json') {
      result = await this.importFromJson(filePath);
    } else {
      throw new Error('Unsupported file type. Use .xlsx, .xls, or .json');
    }

    // Laravel also calls CignaCptIcdCrosswalkCacheService::warmCache(); Nest has no dedicated
    // Cigna cache service, so a lookup-cache invalidate stands in for the Redis warm step.
    if (result.errors === 0 && !options.noWarm) {
      await this.lookupSync.syncTable('cigna_cpt_icd_crosswalk');
    }

    return result;
  }

  private async importFromExcel(
    filePath: string,
    options: CignaCptIcdCrosswalkImportOptions,
  ): Promise<CignaCptIcdCrosswalkImportResult> {
    const chunkSize = Math.max(100, options.chunk ?? 500);
    const workbook = await loadExcelWorkbook(filePath);

    const cptSheet = resolveWorksheetByPreferredNames(workbook, CIGNA_CPT_SHEET_NAMES);
    const cptRows = worksheetToRows(cptSheet);
    const cptHeaderRowIndex = findHeaderRowIndexByFirstColumn(cptRows, CIGNA_HCPCS_HEADER_ALIASES);
    const cptCodes = extractSingleColumnCodes(cptRows, cptHeaderRowIndex, false);

    const icdSheet = resolveWorksheetByPreferredNames(workbook, CIGNA_ICD_SHEET_NAMES);
    const icdCodes = this.extractIcdCodes(worksheetToRows(icdSheet));

    if (cptCodes.length === 0) {
      throw new Error('No CPT/HCPCS codes found. Expected an HCPCS or CPT sheet with code values.');
    }
    if (icdCodes.length === 0) {
      throw new Error('No ICD codes found. Expected an ICD sheet with code values.');
    }

    let imported = 0;
    let updated = 0;
    let skipped = 0;
    const errors = 0;
    let batch: CrosswalkRow[] = [];

    for (const cptCode of cptCodes) {
      for (const icdCode of icdCodes) {
        if (cptCode === '' || icdCode === '') {
          skipped += 1;
          continue;
        }

        batch.push({ cptCode, icdCode, isActive: true });

        if (batch.length >= chunkSize) {
          const [importedCount, updatedCount] = await this.persistBatch(batch);
          imported += importedCount;
          updated += updatedCount;
          batch = [];
        }
      }
    }

    if (batch.length > 0) {
      const [importedCount, updatedCount] = await this.persistBatch(batch);
      imported += importedCount;
      updated += updatedCount;
    }

    return { imported, updated, skipped, errors };
  }

  private extractIcdCodes(rows: string[][]): string[] {
    if (rows.length === 0) {
      return [];
    }
    const headerRowIndex = findHeaderRowIndexByFirstColumn(rows, CIGNA_ICD_HEADER_ALIASES);
    const seen = new Set<string>();
    const codes: string[] = [];
    for (let i = headerRowIndex + 1; i < rows.length; i += 1) {
      const cell = (rows[i]?.[0] ?? '').trim();
      if (cell === '') {
        continue;
      }
      for (const code of expandCignaIcdCell(cell)) {
        if (!seen.has(code)) {
          seen.add(code);
          codes.push(code);
        }
      }
    }
    return codes;
  }

  private async importFromJson(filePath: string): Promise<CignaCptIcdCrosswalkImportResult> {
    const chunkSize = 1000;
    const content = readFileSync(filePath, 'utf8');
    const data = JSON.parse(content) as { crosswalk?: CrosswalkJson[] } | CrosswalkJson[];
    const records = Array.isArray(data) ? data : (data.crosswalk ?? []);

    let imported = 0;
    let updated = 0;
    let errors = 0;
    let batch: CrosswalkRow[] = [];

    for (const recordData of records) {
      if (!recordData.cpt_code || !recordData.icd_code) {
        errors += 1;
        continue;
      }

      batch.push({
        cptCode: String(recordData.cpt_code).trim(),
        icdCode: String(recordData.icd_code).trim(),
        isActive: recordData.is_active ?? true,
      });

      if (batch.length >= chunkSize) {
        const [importedCount, updatedCount] = await this.persistBatch(batch);
        imported += importedCount;
        updated += updatedCount;
        batch = [];
      }
    }

    if (batch.length > 0) {
      const [importedCount, updatedCount] = await this.persistBatch(batch);
      imported += importedCount;
      updated += updatedCount;
    }

    return { imported, updated, skipped: 0, errors };
  }

  private dedupeBatch(batch: CrosswalkRow[]): CrosswalkRow[] {
    const unique = new Map<string, CrosswalkRow>();
    for (const row of batch) {
      if (row.cptCode === '' || row.icdCode === '') {
        continue;
      }
      unique.set(`${row.cptCode}|${row.icdCode}`, row);
    }
    return [...unique.values()];
  }

  private async persistBatch(batch: CrosswalkRow[]): Promise<[number, number]> {
    const records = this.dedupeBatch(batch);
    if (records.length === 0) {
      return [0, 0];
    }

    await this.prisma.$transaction(
      records.map((row) =>
        this.prisma.cignaCptIcdCrosswalk.upsert({
          where: { cptCode_icdCode: { cptCode: row.cptCode, icdCode: row.icdCode } },
          create: { cptCode: row.cptCode, icdCode: row.icdCode, isActive: row.isActive },
          update: { isActive: row.isActive },
        }),
      ),
    );
    return [0, records.length];
  }
}
