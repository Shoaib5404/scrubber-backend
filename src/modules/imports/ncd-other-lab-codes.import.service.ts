import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  chunkArray,
  loadExcelWorkbook,
  readNcdLabCodesColumn,
  resolveWorksheetByPreferredNames,
  worksheetToRows,
} from './import.utils';
import { LookupSyncHelper } from './lookup-sync.helper';

export interface NcdOtherLabCodesImportOptions {
  truncate?: boolean;
  chunk?: number;
}

export interface NcdOtherLabCodesImportResult {
  cptCodeCount: number;
  icdCodeCount: number;
  expectedTotal: number;
  imported: number;
  tableTotal: number;
}

/**
 * Laravel App\Console\Commands\ImportNcdOtherLabCodes (ncd-other-lab:import-codes).
 * Every CPT code is linked to every ICD code from the workbook (cartesian product).
 */
@Injectable()
export class NcdOtherLabCodesImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lookupSync: LookupSyncHelper,
  ) {}

  async importFromFile(
    filePath: string,
    options: NcdOtherLabCodesImportOptions = {},
  ): Promise<NcdOtherLabCodesImportResult> {
    const chunkSize = Math.max(100, options.chunk ?? 1000);

    if (options.truncate) {
      await this.prisma.$executeRawUnsafe('TRUNCATE TABLE "ncd_other_lab_codes" RESTART IDENTITY');
    }

    const workbook = await loadExcelWorkbook(filePath);
    const icdSheet = resolveWorksheetByPreferredNames(workbook, ['ICD']);
    const cptSheet = resolveWorksheetByPreferredNames(workbook, ['CPT']);

    const icdCodes = readNcdLabCodesColumn(worksheetToRows(icdSheet));
    const cptCodes = readNcdLabCodesColumn(worksheetToRows(cptSheet));

    if (cptCodes.length === 0) {
      throw new Error('No CPT codes found in the CPT sheet.');
    }
    if (icdCodes.length === 0) {
      throw new Error('No ICD codes found in the ICD sheet.');
    }

    const expectedTotal = cptCodes.length * icdCodes.length;

    let imported = 0;
    for (const cpt of cptCodes) {
      const rows = icdCodes.map((icd) => ({ cpt, icd }));
      for (const batch of chunkArray(rows, chunkSize)) {
        imported += await this.persistBatch(batch);
      }
    }

    await this.lookupSync.syncTable('ncd_other_lab_codes');
    const tableTotal = await this.prisma.ncdOtherLabCode.count();

    return {
      cptCodeCount: cptCodes.length,
      icdCodeCount: icdCodes.length,
      expectedTotal,
      imported,
      tableTotal,
    };
  }

  private async persistBatch(batch: { cpt: string; icd: string }[]): Promise<number> {
    if (batch.length === 0) {
      return 0;
    }
    await this.prisma.$transaction(
      batch.map((row) =>
        this.prisma.ncdOtherLabCode.upsert({
          where: { cpt_icd: { cpt: row.cpt, icd: row.icd } },
          create: { cpt: row.cpt, icd: row.icd, isActive: true },
          update: { isActive: true },
        }),
      ),
    );
    return batch.length;
  }
}
