import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { CodeListImportOptions, CodeListImportResult } from './import.types';
import {
  excelHeadersLowerTrim,
  getMappedColumnValue,
  loadExcelRows,
  mapGenderSpecificCptExcelColumns,
  parseGenderSpecificCptGender,
} from './import.utils';
import { LookupSyncHelper } from './lookup-sync.helper';

interface GenderSpecificCptRow {
  cptCode: string;
  description: string | null;
  gender: string;
  isActive: boolean;
}

@Injectable()
export class GenderSpecificCptRulesImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lookupSync: LookupSyncHelper,
  ) {}

  async importFromFile(
    filePath: string,
    options: CodeListImportOptions = {},
  ): Promise<CodeListImportResult> {
    const chunkSize = Math.max(1, options.chunk ?? 500);
    const rows = await loadExcelRows(filePath);
    if (rows.length === 0) {
      throw new Error('Excel file is empty.');
    }

    const headers = excelHeadersLowerTrim(rows[0] ?? []);
    const columnMap = mapGenderSpecificCptExcelColumns(headers);
    if (columnMap.cpt_code === undefined) {
      throw new Error('Could not find CPT code column in the Excel file.');
    }

    let upserted = 0;
    let skipped = 0;
    let batch: GenderSpecificCptRow[] = [];

    for (const row of rows.slice(1)) {
      const cptCode = getMappedColumnValue(row, columnMap, 'cpt_code');
      if (cptCode === null) {
        skipped += 1;
        continue;
      }

      batch.push({
        cptCode,
        description: getMappedColumnValue(row, columnMap, 'description'),
        gender: parseGenderSpecificCptGender(getMappedColumnValue(row, columnMap, 'gender')),
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

    await this.lookupSync.syncTable('gender_specific_cpt_rules');
    return { upserted, skipped };
  }

  private dedupeByCptCode(batch: GenderSpecificCptRow[]): GenderSpecificCptRow[] {
    const unique = new Map<string, GenderSpecificCptRow>();
    for (const row of batch) {
      unique.set(row.cptCode, row);
    }
    return [...unique.values()];
  }

  private async upsertBatch(batch: GenderSpecificCptRow[]): Promise<number> {
    const unique = this.dedupeByCptCode(batch);
    await this.prisma.$transaction(
      unique.map((row) =>
        this.prisma.genderSpecificCptRule.upsert({
          where: { cptCode: row.cptCode },
          create: {
            cptCode: row.cptCode,
            description: row.description,
            gender: row.gender,
            isActive: row.isActive,
          },
          update: {
            description: row.description,
            gender: row.gender,
            isActive: row.isActive,
          },
        }),
      ),
    );
    return unique.length;
  }
}
