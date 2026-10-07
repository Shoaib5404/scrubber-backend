import { Injectable } from '@nestjs/common';
import * as path from 'path';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  AetnaIcdRow,
  createAetnaIcdSourceExpander,
  extractAetnaCptCodes,
  extractAetnaIcdRows,
  extractAetnaIcdRowsFromCsvDataRows,
  parseAetnaCptOption,
} from './aetna-lcd-import.helpers';
import { Icd10RangeExpander } from './icd10-range.expander';
import {
  AETNA_CPT_SHEET_NAMES,
  AETNA_ICD_SHEET_NAMES,
  loadExcelWorkbook,
  parseCsvFile,
  resolveWorksheetByPreferredNames,
  worksheetToRows,
} from './import.utils';
import { LookupSyncHelper } from './lookup-sync.helper';

export interface AetnaB12LcdImportOptions {
  truncate?: boolean;
  chunk?: number;
  dryRun?: boolean;
  cpt?: string;
}

export interface AetnaB12LcdImportResult {
  cptCodeCount: number;
  sourceIcdRowCount: number;
  expandedIcdCount: number;
  crosswalkRowCount: number;
  imported: number;
  dryRun: boolean;
}

interface CrosswalkRow {
  cpt: string;
  icd: string;
  description: string;
}

/** Laravel App\Console\Commands\ImportAetnaB12Lcd (aetna-b12-lcd:import). */
@Injectable()
export class AetnaB12LcdImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rangeExpander: Icd10RangeExpander,
    private readonly lookupSync: LookupSyncHelper,
  ) {}

  async importFromFile(
    filePath: string,
    options: AetnaB12LcdImportOptions = {},
  ): Promise<AetnaB12LcdImportResult> {
    const chunkSize = Math.max(1, options.chunk ?? 500);
    const dryRun = options.dryRun ?? false;

    const ext = path.extname(filePath).toLowerCase();
    let cptCodes: string[];
    let icdRows: AetnaIcdRow[];

    if (ext === '.xlsx' || ext === '.xls') {
      ({ cptCodes, icdRows } = await this.parseExcel(filePath));
    } else if (ext === '.csv') {
      ({ cptCodes, icdRows } = await this.parseCsv(filePath, parseAetnaCptOption(options.cpt)));
    } else {
      throw new Error('Unsupported file type. Use .xlsx, .xls, or .csv');
    }

    const expandedIcdCount = icdRows.reduce((sum, row) => sum + row.icds.length, 0);
    const crosswalkRowCount = cptCodes.length * expandedIcdCount;

    if (dryRun) {
      return {
        cptCodeCount: cptCodes.length,
        sourceIcdRowCount: icdRows.length,
        expandedIcdCount,
        crosswalkRowCount,
        imported: 0,
        dryRun: true,
      };
    }

    if (options.truncate) {
      await this.prisma.$executeRawUnsafe('TRUNCATE TABLE "aetna_b12_lcd" RESTART IDENTITY');
    }

    let imported = 0;
    let batch: CrosswalkRow[] = [];

    for (const cpt of cptCodes) {
      for (const icdRow of icdRows) {
        for (const icd of icdRow.icds) {
          batch.push({ cpt, icd, description: icdRow.description });
          if (batch.length >= chunkSize) {
            imported += await this.upsertBatch(batch);
            batch = [];
          }
        }
      }
    }

    if (batch.length > 0) {
      imported += await this.upsertBatch(batch);
    }

    await this.lookupSync.syncTable('aetna_b12_lcd');

    return {
      cptCodeCount: cptCodes.length,
      sourceIcdRowCount: icdRows.length,
      expandedIcdCount,
      crosswalkRowCount,
      imported,
      dryRun: false,
    };
  }

  private async parseExcel(filePath: string): Promise<{ cptCodes: string[]; icdRows: AetnaIcdRow[] }> {
    const workbook = await loadExcelWorkbook(filePath);

    const cptSheet = resolveWorksheetByPreferredNames(workbook, AETNA_CPT_SHEET_NAMES);
    const cptCodes = extractAetnaCptCodes(worksheetToRows(cptSheet));
    if (cptCodes.length === 0) {
      throw new Error('No CPT codes found. Expected a CPT sheet with code values.');
    }

    const icdSheet = resolveWorksheetByPreferredNames(workbook, AETNA_ICD_SHEET_NAMES);
    const expandSource = createAetnaIcdSourceExpander(this.prisma, this.rangeExpander);
    // B12 keeps empty-icds continuation rows (matches Laravel ImportAetnaB12Lcd exactly).
    const icdRows = await extractAetnaIcdRows(worksheetToRows(icdSheet), expandSource, false);
    if (icdRows.length === 0) {
      throw new Error('No ICD rows found. Expected an ICD sheet with Code and Code Description columns.');
    }

    return { cptCodes, icdRows };
  }

  private async parseCsv(
    filePath: string,
    cptCodes: string[] | null,
  ): Promise<{ cptCodes: string[]; icdRows: AetnaIcdRow[] }> {
    if (cptCodes === null || cptCodes.length === 0) {
      throw new Error(
        'CSV import requires --cpt=CODE1,CODE2 (the workbook CPT tab is not in this file).',
      );
    }

    const rows = parseCsvFile(filePath);
    if (rows.length === 0) {
      throw new Error('CSV is empty.');
    }

    const expandSource = createAetnaIcdSourceExpander(this.prisma, this.rangeExpander);
    const icdRows = await extractAetnaIcdRowsFromCsvDataRows(rows.slice(1), expandSource);
    if (icdRows.length === 0) {
      throw new Error('No ICD rows found in CSV.');
    }

    return { cptCodes, icdRows };
  }

  private dedupeBatch(batch: CrosswalkRow[]): CrosswalkRow[] {
    const unique = new Map<string, CrosswalkRow>();
    for (const row of batch) {
      unique.set(`${row.cpt}|${row.icd}`, row);
    }
    return [...unique.values()];
  }

  private async upsertBatch(batch: CrosswalkRow[]): Promise<number> {
    const records = this.dedupeBatch(batch);
    if (records.length === 0) {
      return 0;
    }

    await this.prisma.$transaction(
      records.map((row) =>
        this.prisma.aetnaB12Lcd.upsert({
          where: { cpt_icd: { cpt: row.cpt, icd: row.icd } },
          create: { cpt: row.cpt, icd: row.icd, description: row.description, isActive: true },
          update: { description: row.description, isActive: true },
        }),
      ),
    );
    return records.length;
  }
}
