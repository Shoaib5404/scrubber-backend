import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { CodeListImportOptions, CodeListImportResult } from './import.types';
import {
  dedupeBatchByKey,
  getCsvValue,
  mapMue87726UhcOxfordColumns,
  parseAlphanumericCode,
  parseCsvFile,
  parseCtypeDigitInteger,
} from './import.utils';
import { LookupSyncHelper } from './lookup-sync.helper';

@Injectable()
export class Mue87726Uhc06111OxfordImportService {
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
        'TRUNCATE TABLE "mue_87726_uhc_06111_oxford" RESTART IDENTITY',
      );
    }

    const allRows = parseCsvFile(filePath);
    if (allRows.length === 0) {
      throw new Error('CSV file is empty or unreadable.');
    }

    const columnMap = mapMue87726UhcOxfordColumns(allRows[0] ?? []);
    if (
      columnMap.cptCode === undefined ||
      columnMap.min === undefined ||
      columnMap.max === undefined
    ) {
      throw new Error('Could not find required columns. Expected Code, MINIMUN, and MAXIMUN.');
    }

    const cptCol = columnMap.cptCode;
    const minCol = columnMap.min;
    const maxCol = columnMap.max;

    let upserted = 0;
    let skipped = 0;
    let batch: { cptCode: string; min: number; max: number }[] = [];

    for (const row of allRows.slice(1)) {
      const cptCode = parseAlphanumericCode(getCsvValue(row, cptCol));
      const min = parseCtypeDigitInteger(getCsvValue(row, minCol));
      const max = parseCtypeDigitInteger(getCsvValue(row, maxCol));

      if (cptCode === null || min === null || max === null) {
        skipped += 1;
        continue;
      }

      batch.push({ cptCode, min, max });
      if (batch.length >= chunkSize) {
        upserted += await this.upsertBatch(batch);
        batch = [];
      }
    }

    if (batch.length > 0) {
      upserted += await this.upsertBatch(batch);
    }

    await this.lookupSync.syncTable('mue_87726_uhc_06111_oxford');

    return { upserted, skipped };
  }

  private async upsertBatch(batch: { cptCode: string; min: number; max: number }[]): Promise<number> {
    const unique = dedupeBatchByKey(
      batch.map((row) => ({
        cptCode: row.cptCode,
        min: String(row.min),
        max: String(row.max),
      })),
      'cptCode',
    ).map((row) => ({
      cptCode: row.cptCode,
      min: Number(row.min),
      max: Number(row.max),
    }));

    await this.prisma.$transaction(
      unique.map((row) =>
        this.prisma.mue87726Uhc06111Oxford.upsert({
          where: { cptCode: row.cptCode },
          create: {
            cptCode: row.cptCode,
            min: row.min,
            max: row.max,
            isActive: true,
          },
          update: {
            min: row.min,
            max: row.max,
            isActive: true,
          },
        }),
      ),
    );
    return unique.length;
  }
}
