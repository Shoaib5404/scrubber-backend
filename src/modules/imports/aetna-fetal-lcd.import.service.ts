import { Injectable } from '@nestjs/common';
import * as path from 'path';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  AetnaIcdRow,
  createAetnaIcdSourceExpander,
  extractAetnaCptCodes,
  extractAetnaIcdRows,
} from './aetna-lcd-import.helpers';
import { Icd10RangeExpander } from './icd10-range.expander';
import {
  AETNA_CPT_SHEET_NAMES,
  AETNA_ICD_SHEET_NAMES,
  loadExcelWorkbook,
  resolveWorksheetByPreferredNames,
  worksheetToRows,
} from './import.utils';
import { LookupSyncHelper } from './lookup-sync.helper';

export interface AetnaFetalLcdImportOptions {
  truncate?: boolean;
  chunk?: number;
  dryRun?: boolean;
}

export interface AetnaFetalLcdImportResult {
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

/** Laravel App\Console\Commands\ImportAetnaFetalLcd (aetna-fetal-lcd:import). */
@Injectable()
export class AetnaFetalLcdImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rangeExpander: Icd10RangeExpander,
    private readonly lookupSync: LookupSyncHelper,
  ) {}

  async importFromFile(
    filePath: string,
    options: AetnaFetalLcdImportOptions = {},
  ): Promise<AetnaFetalLcdImportResult> {
    const chunkSize = Math.max(1, options.chunk ?? 500);
    const dryRun = options.dryRun ?? false;

    const ext = path.extname(filePath).toLowerCase();
    if (ext !== '.xlsx' && ext !== '.xls') {
      throw new Error('Unsupported file type. Use .xlsx or .xls');
    }

    const { cptCodes, icdRows } = await this.parseExcel(filePath);

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
      await this.prisma.$executeRawUnsafe('TRUNCATE TABLE "aetna_fetal_lcd" RESTART IDENTITY');
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

    await this.lookupSync.syncTable('aetna_fetal_lcd');

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
    // Fetal drops continuation rows that expand to zero valid ICDs (unlike B12).
    const icdRows = await extractAetnaIcdRows(worksheetToRows(icdSheet), expandSource, true);
    if (icdRows.length === 0) {
      throw new Error('No ICD rows found. Expected an ICD sheet with ICD Code and description columns.');
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
        this.prisma.aetnaFetalLcd.upsert({
          where: { cpt_icd: { cpt: row.cpt, icd: row.icd } },
          create: { cpt: row.cpt, icd: row.icd, description: row.description, isActive: true },
          update: { description: row.description, isActive: true },
        }),
      ),
    );
    return records.length;
  }
}
