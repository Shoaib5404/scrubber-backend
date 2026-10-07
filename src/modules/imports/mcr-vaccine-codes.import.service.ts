import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  loadExcelWorkbook,
  mapMcrVaccineCodeExcelColumns,
  normalizeHeader,
  parseAlphanumericCode,
  resolveMcrVaccineCodeType,
  worksheetToRows,
} from './import.utils';
import { LookupSyncHelper } from './lookup-sync.helper';

export interface McrVaccineCodesImportOptions {
  truncate?: boolean;
  chunk?: number;
}

export interface McrVaccineCodesImportResult {
  imported: number;
  updated: number;
  skipped: number;
  errors: number;
}

interface McrVaccineCodeRow {
  type: string;
  vaccineCode: string;
  icd10Code: string | null;
  administrationCode: string | null;
}

/** Laravel App\Console\Commands\ImportMcrVaccineCodes (mcr-vaccine-codes:import). */
@Injectable()
export class McrVaccineCodesImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lookupSync: LookupSyncHelper,
  ) {}

  async importFromFile(
    filePath: string,
    options: McrVaccineCodesImportOptions = {},
  ): Promise<McrVaccineCodesImportResult> {
    if (options.truncate) {
      await this.prisma.mcrVaccineCode.deleteMany({});
    }

    const chunkSize = Math.max(1, options.chunk ?? 500);
    const workbook = await loadExcelWorkbook(filePath);

    let imported = 0;
    let updated = 0;
    let skipped = 0;
    let errors = 0;

    for (const sheet of workbook.worksheets) {
      const type = resolveMcrVaccineCodeType(sheet.name);
      if (type === null) {
        continue;
      }

      const rows = worksheetToRows(sheet);
      if (rows.length === 0) {
        continue;
      }

      const headers = (rows[0] ?? []).map((header) => normalizeHeader(String(header ?? '')));
      const columnMap = mapMcrVaccineCodeExcelColumns(headers);
      if (columnMap.vaccine_code === undefined) {
        errors += 1;
        continue;
      }

      let batch: McrVaccineCodeRow[] = [];
      for (const row of rows.slice(1)) {
        const vaccineCode = parseAlphanumericCode(this.column(row, columnMap, 'vaccine_code'));
        if (vaccineCode === null) {
          skipped += 1;
          continue;
        }

        batch.push({
          type,
          vaccineCode,
          icd10Code: parseAlphanumericCode(this.column(row, columnMap, 'icd10_code')),
          administrationCode: parseAlphanumericCode(
            this.column(row, columnMap, 'administration_code'),
          ),
        });

        if (batch.length >= chunkSize) {
          updated += await this.persistBatch(batch);
          batch = [];
        }
      }

      if (batch.length > 0) {
        updated += await this.persistBatch(batch);
      }
    }

    await this.lookupSync.syncTable('mcr_vaccine_codes');

    return { imported, updated, skipped, errors };
  }

  private column(
    row: string[],
    columnMap: Partial<Record<string, number>>,
    field: string,
  ): string | null {
    const index = columnMap[field];
    if (index === undefined || index < 0 || index >= row.length) {
      return null;
    }
    const value = (row[index] ?? '').trim();
    return value === '' ? null : value;
  }

  private dedupeByTypeVaccineCode(batch: McrVaccineCodeRow[]): McrVaccineCodeRow[] {
    const unique = new Map<string, McrVaccineCodeRow>();
    for (const row of batch) {
      unique.set(`${row.type}|${row.vaccineCode}`, row);
    }
    return [...unique.values()];
  }

  /** Mirrors Laravel ImportMcrVaccineCodes::persistBatch — always reports as "updated" (upsert). */
  private async persistBatch(batch: McrVaccineCodeRow[]): Promise<number> {
    const records = this.dedupeByTypeVaccineCode(batch);
    if (records.length === 0) {
      return 0;
    }

    await this.prisma.$transaction(
      records.map((row) =>
        this.prisma.mcrVaccineCode.upsert({
          where: { type_vaccineCode: { type: row.type, vaccineCode: row.vaccineCode } },
          create: {
            type: row.type,
            vaccineCode: row.vaccineCode,
            icd10Code: row.icd10Code,
            administrationCode: row.administrationCode,
            isActive: true,
          },
          update: {
            icd10Code: row.icd10Code,
            administrationCode: row.administrationCode,
            isActive: true,
          },
        }),
      ),
    );
    return records.length;
  }
}
