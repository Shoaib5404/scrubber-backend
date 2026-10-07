import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { chunkArray, loadExcelWorkbook, readNcdLabCodesColumn, worksheetToRows } from './import.utils';
import { LookupSyncHelper } from './lookup-sync.helper';

export interface NcdOtherLabImportOptions {
  truncate?: boolean;
  chunk?: number;
  icdSheetIndex?: number;
  cptSheetIndex?: number;
}

export interface NcdOtherLabImportResult {
  icdCodeCount: number;
  cptCodeCount: number;
  cptRowsUpserted: number;
  icdRowsUpserted: number;
}

/**
 * Laravel App\Console\Commands\ImportNcdOtherLab (ncd-other-lab:import).
 * Two independent code lists (ICD, CPT) — no CPT x ICD pairing.
 */
@Injectable()
export class NcdOtherLabImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lookupSync: LookupSyncHelper,
  ) {}

  async importFromFile(
    filePath: string,
    options: NcdOtherLabImportOptions = {},
  ): Promise<NcdOtherLabImportResult> {
    const icdSheetIndex = options.icdSheetIndex ?? 0;
    const cptSheetIndex = options.cptSheetIndex ?? 1;
    const chunkSize = Math.max(100, options.chunk ?? 800);

    const workbook = await loadExcelWorkbook(filePath);
    if (workbook.worksheets.length < Math.max(icdSheetIndex, cptSheetIndex) + 1) {
      throw new Error('Workbook does not contain the requested ICD/CPT sheets.');
    }

    const icdSheet = workbook.worksheets[icdSheetIndex];
    const cptSheet = workbook.worksheets[cptSheetIndex];
    if (!icdSheet || !cptSheet) {
      throw new Error('Workbook does not contain the requested ICD/CPT sheets.');
    }

    const icdCodes = readNcdLabCodesColumn(worksheetToRows(icdSheet));
    const cptCodes = readNcdLabCodesColumn(worksheetToRows(cptSheet));

    if (cptCodes.length === 0) {
      throw new Error('No CPT codes found in the CPT sheet.');
    }
    if (icdCodes.length === 0) {
      throw new Error('No ICD codes found in the ICD sheet.');
    }

    if (options.truncate) {
      await this.prisma.$executeRawUnsafe('TRUNCATE TABLE "ncd_other_lab_icd" RESTART IDENTITY');
      await this.prisma.$executeRawUnsafe('TRUNCATE TABLE "ncd_other_lab_cpt" RESTART IDENTITY');
    }

    let cptRowsUpserted = 0;
    for (const batch of chunkArray(cptCodes, chunkSize)) {
      await this.prisma.$transaction(
        batch.map((cptCode) =>
          this.prisma.ncdOtherLabCpt.upsert({
            where: { cptCode },
            create: { cptCode, isActive: true },
            update: { isActive: true },
          }),
        ),
      );
      cptRowsUpserted += batch.length;
    }

    let icdRowsUpserted = 0;
    for (const batch of chunkArray(icdCodes, chunkSize)) {
      await this.prisma.$transaction(
        batch.map((icdCode) =>
          this.prisma.ncdOtherLabIcd.upsert({
            where: { icdCode },
            create: { icdCode, isActive: true },
            update: { isActive: true },
          }),
        ),
      );
      icdRowsUpserted += batch.length;
    }

    // Laravel only invalidates the ncd_other_lab_cpt lookup-cache entry for this command.
    await this.lookupSync.syncTable('ncd_other_lab_cpt');

    return {
      icdCodeCount: icdCodes.length,
      cptCodeCount: cptCodes.length,
      cptRowsUpserted,
      icdRowsUpserted,
    };
  }
}
