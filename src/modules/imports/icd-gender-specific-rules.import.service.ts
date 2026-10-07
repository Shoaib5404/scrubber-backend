import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { CodeListImportOptions, CodeListImportResult } from './import.types';
import {
  getMappedColumnValue,
  loadExcelRows,
  normalizeHeaders,
  parseIcdGenderSpecificGender,
  resolveColumnIndex,
} from './import.utils';
import { LookupSyncHelper } from './lookup-sync.helper';

interface IcdGenderSpecificRow {
  icdCode: string;
  description: string | null;
  gender: string;
  isActive: boolean;
}

@Injectable()
export class IcdGenderSpecificRulesImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lookupSync: LookupSyncHelper,
  ) {}

  async importFromFile(
    filePath: string,
    options: CodeListImportOptions = {},
  ): Promise<CodeListImportResult> {
    const chunkSize = Math.max(1, options.chunk ?? 1000);

    if (options.truncate) {
      await this.prisma.$executeRawUnsafe(
        'TRUNCATE TABLE "icd_gender_specific_rules" RESTART IDENTITY',
      );
    }

    const rows = await loadExcelRows(filePath);
    if (rows.length === 0) {
      throw new Error('Excel file is empty.');
    }

    const columns = normalizeHeaders(rows[0] ?? []);
    const codeCol = resolveColumnIndex(columns, ['icd', 'icd_code'], 0);
    const descriptionCol = resolveColumnIndex(columns, ['description'], 1);
    const sexCol = resolveColumnIndex(columns, ['sex', 'gender'], 2);

    const columnMap = {
      icd_code: codeCol,
      description: descriptionCol,
      gender: sexCol,
    };

    let upserted = 0;
    let skipped = 0;
    let batch: IcdGenderSpecificRow[] = [];

    for (const row of rows.slice(1)) {
      const icdCode = getMappedColumnValue(row, columnMap, 'icd_code');
      if (icdCode === null) {
        skipped += 1;
        continue;
      }

      batch.push({
        icdCode,
        description: getMappedColumnValue(row, columnMap, 'description'),
        gender: parseIcdGenderSpecificGender(getMappedColumnValue(row, columnMap, 'gender')),
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

    await this.lookupSync.syncTable('icd_gender_specific_rules');
    return { upserted, skipped };
  }

  private async upsertBatch(batch: IcdGenderSpecificRow[]): Promise<number> {
    await this.prisma.$transaction(
      batch.map((row) =>
        this.prisma.icdGenderSpecificRule.upsert({
          where: { icdCode_gender: { icdCode: row.icdCode, gender: row.gender } },
          create: {
            icdCode: row.icdCode,
            description: row.description,
            gender: row.gender,
            isActive: row.isActive,
          },
          update: {
            description: row.description,
            isActive: row.isActive,
          },
        }),
      ),
    );
    return batch.length;
  }
}
