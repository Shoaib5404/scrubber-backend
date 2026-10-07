import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { CodeListImportOptions, CodeListImportResult } from './import.types';
import {
  dedupeBatchByKey,
  getCsvValue,
  normalizeHeaders,
  parseCsvFile,
  parseImportActive,
  parseImportUnit,
  resolveColumnIndex,
} from './import.utils';
import { LookupSyncHelper } from './lookup-sync.helper';

@Injectable()
export class AnesthesiaCodesImportService {
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
        'TRUNCATE TABLE "anesthesia_codes" RESTART IDENTITY',
      );
    }

    const allRows = parseCsvFile(filePath);
    if (allRows.length === 0) {
      throw new Error('CSV file is empty.');
    }

    const columns = normalizeHeaders(allRows[0] ?? []);
    const cptCodeCol = resolveColumnIndex(columns, ['cpt_code'], 0);
    const unitCol = resolveColumnIndex(columns, ['unit', '2018_base_unit', '2018'], 1);
    const activeCol = columns.active ?? null;

    let upserted = 0;
    let skipped = 0;
    let batch: { cptCode: string; unit: number; active: boolean }[] = [];

    for (const row of allRows.slice(1)) {
      const cptCode = getCsvValue(row, cptCodeCol);
      const unitValue = getCsvValue(row, unitCol);

      if (cptCode === null) {
        skipped += 1;
        continue;
      }

      const unit = parseImportUnit(unitValue);
      if (unit === null) {
        skipped += 1;
        continue;
      }

      const active = parseImportActive(
        activeCol === null ? null : getCsvValue(row, activeCol),
      );

      batch.push({ cptCode, unit, active });
      if (batch.length >= chunkSize) {
        upserted += await this.upsertBatch(batch);
        batch = [];
      }
    }

    if (batch.length > 0) {
      upserted += await this.upsertBatch(batch);
    }

    await this.lookupSync.syncTable('anesthesia_codes');

    return { upserted, skipped };
  }

  private async upsertBatch(
    batch: { cptCode: string; unit: number; active: boolean }[],
  ): Promise<number> {
    const unique = dedupeBatchByKey(
      batch.map((row) => ({
        cptCode: row.cptCode,
        unit: String(row.unit),
        active: String(row.active),
      })),
      'cptCode',
    ).map((row) => ({
      cptCode: row.cptCode,
      unit: Number(row.unit),
      active: row.active === 'true',
    }));

    await this.prisma.$transaction(
      unique.map((row) =>
        this.prisma.anesthesiaCode.upsert({
          where: { cptCode: row.cptCode },
          create: { cptCode: row.cptCode, unit: row.unit, active: row.active },
          update: { unit: row.unit, active: row.active },
        }),
      ),
    );
    return unique.length;
  }
}
