import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { CodeListImportOptions, CodeListImportResult } from './import.types';
import {
  dedupeBatchByKey,
  getCsvValue,
  mapGlobalDaysSurgeryColumns,
  parseAlphanumericCode,
  parseCsvFile,
  parseGlobalDaysDigits,
} from './import.utils';
import { LookupSyncHelper } from './lookup-sync.helper';

@Injectable()
export class GlobalDaysSurgeriesImportService {
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
        'TRUNCATE TABLE "global_days_surgeries" RESTART IDENTITY',
      );
    }

    const allRows = parseCsvFile(filePath);
    if (allRows.length === 0) {
      throw new Error('CSV is empty or unreadable.');
    }

    const columnMap = mapGlobalDaysSurgeryColumns(allRows[0] ?? []);
    if (columnMap.cptCode === undefined || columnMap.days === undefined) {
      throw new Error(
        'Could not find required columns. Expected HCPCS/CPT code and Global Days.',
      );
    }

    const cptCodeCol = columnMap.cptCode;
    const daysCol = columnMap.days;
    const descriptionCol = columnMap.description ?? null;

    let upserted = 0;
    let skipped = 0;
    let batch: {
      cptCode: string;
      description: string | null;
      days: number;
    }[] = [];

    for (const row of allRows.slice(1)) {
      const cptCode = parseAlphanumericCode(getCsvValue(row, cptCodeCol));
      const days = parseGlobalDaysDigits(getCsvValue(row, daysCol));

      if (cptCode === null || days === null) {
        skipped += 1;
        continue;
      }

      batch.push({
        cptCode,
        description: getCsvValue(row, descriptionCol),
        days,
      });

      if (batch.length >= chunkSize) {
        upserted += await this.upsertBatch(batch);
        batch = [];
      }
    }

    if (batch.length > 0) {
      upserted += await this.upsertBatch(batch);
    }

    await this.lookupSync.syncTable('global_days_surgeries');

    return { upserted, skipped };
  }

  private async upsertBatch(
    batch: { cptCode: string; description: string | null; days: number }[],
  ): Promise<number> {
    const unique = dedupeBatchByKey(
      batch.map((row) => ({
        cptCode: row.cptCode,
        description: row.description ?? '',
        days: String(row.days),
      })),
      'cptCode',
    ).map((row) => ({
      cptCode: row.cptCode,
      description: row.description === '' ? null : row.description,
      days: Number(row.days),
    }));

    await this.prisma.$transaction(
      unique.map((row) =>
        this.prisma.globalDaysSurgery.upsert({
          where: { cptCode: row.cptCode },
          create: {
            cptCode: row.cptCode,
            description: row.description,
            days: row.days,
            isActive: true,
          },
          update: {
            description: row.description,
            days: row.days,
            isActive: true,
          },
        }),
      ),
    );
    return unique.length;
  }
}
