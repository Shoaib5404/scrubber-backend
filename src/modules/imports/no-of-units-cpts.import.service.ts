import { Injectable } from '@nestjs/common';
import * as path from 'path';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { CodeListImportOptions, CodeListImportResult } from './import.types';
import {
  dedupeBatchByKey,
  getCsvValue,
  mapNoOfUnitsCptColumn,
  normalizeHeader,
  parseCsvFile,
  parseNoOfUnitsCpt,
} from './import.utils';
import { LookupSyncHelper } from './lookup-sync.helper';

@Injectable()
export class NoOfUnitsCptsImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lookupSync: LookupSyncHelper,
  ) {}

  async importFromFile(
    filePath: string,
    options: CodeListImportOptions = {},
  ): Promise<CodeListImportResult> {
    const ext = path.extname(filePath).toLowerCase();
    if (ext !== '.csv') {
      throw new Error('Unsupported file type. Use .csv');
    }

    const chunkSize = Math.max(1, options.chunk ?? 500);

    if (options.truncate) {
      await this.prisma.$executeRawUnsafe(
        'TRUNCATE TABLE "no_of_units_cpts" RESTART IDENTITY',
      );
    }

    const allRows = parseCsvFile(filePath);
    if (allRows.length === 0) {
      throw new Error('CSV is empty or unreadable.');
    }

    const headerRow = allRows[0] ?? [];
    const headers = headerRow.map((cell) => normalizeHeader(String(cell)));
    const cptColumnIndex = mapNoOfUnitsCptColumn(headers);
    if (cptColumnIndex === null) {
      throw new Error(
        'Could not find CPT/HCPCS column. Expected one of: HCPCS Code, cpt, cpt_code, hcpcs, code',
      );
    }

    let upserted = 0;
    let skipped = 0;
    let batch: { cpt: string }[] = [];

    for (const row of allRows.slice(1)) {
      const cpt = parseNoOfUnitsCpt(getCsvValue(row, cptColumnIndex));
      if (cpt === null) {
        skipped += 1;
        continue;
      }

      batch.push({ cpt });
      if (batch.length >= chunkSize) {
        upserted += await this.persistBatch(batch);
        batch = [];
      }
    }

    if (batch.length > 0) {
      upserted += await this.persistBatch(batch);
    }

    await this.lookupSync.syncTable('no_of_units_cpts');

    return { upserted, skipped };
  }

  private async persistBatch(batch: { cpt: string }[]): Promise<number> {
    const unique = dedupeBatchByKey(batch, 'cpt');
    await this.prisma.$transaction(
      unique.map((row) =>
        this.prisma.noOfUnitsCpt.upsert({
          where: { cpt: row.cpt },
          create: { cpt: row.cpt, isActive: true },
          update: { isActive: true },
        }),
      ),
    );
    return unique.length;
  }
}
