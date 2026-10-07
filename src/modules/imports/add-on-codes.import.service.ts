import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  chunkArray,
  loadExcelRows,
  mapAddOnCodeExcelColumns,
  normalizeHeader,
  nullableTrim,
  parseJulianDateCell,
  parseOptionalIntCast,
} from './import.utils';
import { LookupSyncHelper } from './lookup-sync.helper';

export interface AddOnCodesImportOptions {
  truncate?: boolean;
  chunk?: number;
}

export interface AddOnCodesImportResult {
  imported: number;
  skipped: number;
}

interface AddOnCodeRow {
  primaryCode: string;
  aocEditType: number | null;
  addOnCode: string | null;
  aocDeldt: Date | null;
  primaryCodeDeldt: Date | null;
  aocEditEffdt: Date | null;
  aocEditDeldt: Date | null;
  specialInstructionNotes: string | null;
}

/** Laravel App\Console\Commands\ImportAddOnCodes (add-on-codes:import). */
@Injectable()
export class AddOnCodesImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lookupSync: LookupSyncHelper,
  ) {}

  async importFromFile(
    filePath: string,
    options: AddOnCodesImportOptions = {},
  ): Promise<AddOnCodesImportResult> {
    if (options.truncate) {
      await this.prisma.$executeRawUnsafe('TRUNCATE TABLE "add_on_codes" RESTART IDENTITY');
    }

    const chunkSize = Math.max(1, options.chunk ?? 1000);

    const rows = await loadExcelRows(filePath);
    if (rows.length === 0) {
      throw new Error('Excel file is empty.');
    }

    const headers = (rows[0] ?? []).map((header) =>
      normalizeHeader(String(header ?? '')),
    );
    const columns = mapAddOnCodeExcelColumns(headers);

    let imported = 0;
    let skipped = 0;
    let batch: AddOnCodeRow[] = [];

    for (const row of rows.slice(1)) {
      const primaryCode = this.column(row, columns.primary_code);
      if (primaryCode === null) {
        skipped += 1;
        continue;
      }

      batch.push({
        primaryCode,
        aocEditType: parseOptionalIntCast(this.column(row, columns.aoc_edit_type)),
        addOnCode: this.column(row, columns.add_on_code),
        aocDeldt: parseJulianDateCell(this.column(row, columns.aoc_deldt)),
        primaryCodeDeldt: parseJulianDateCell(this.column(row, columns.primary_code_deldt)),
        aocEditEffdt: parseJulianDateCell(this.column(row, columns.aoc_edit_effdt)),
        aocEditDeldt: parseJulianDateCell(this.column(row, columns.aoc_edit_deldt)),
        specialInstructionNotes: this.column(row, columns.special_instruction_notes),
      });

      if (batch.length >= chunkSize) {
        imported += await this.insertBatch(batch);
        batch = [];
      }
    }

    if (batch.length > 0) {
      imported += await this.insertBatch(batch);
    }

    await this.lookupSync.syncTable('add_on_codes');

    return { imported, skipped };
  }

  private column(row: string[], index: number | null): string | null {
    if (index === null) {
      return null;
    }
    return nullableTrim(row[index] ?? null);
  }

  private async insertBatch(batch: AddOnCodeRow[]): Promise<number> {
    let count = 0;
    for (const rows of chunkArray(batch, 1000)) {
      const result = await this.prisma.addOnCode.createMany({
        data: rows.map((row) => ({
          primaryCode: row.primaryCode,
          aocEditType: row.aocEditType,
          addOnCode: row.addOnCode,
          aocDeldt: row.aocDeldt,
          primaryCodeDeldt: row.primaryCodeDeldt,
          aocEditEffdt: row.aocEditEffdt,
          aocEditDeldt: row.aocEditDeldt,
          specialInstructionNotes: row.specialInstructionNotes,
        })),
      });
      count += result.count;
    }
    return count;
  }
}
