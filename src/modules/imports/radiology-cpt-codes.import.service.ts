import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { CodeListImportOptions, CodeListImportResult } from './import.types';
import {
  dedupeBatchByKey,
  getCsvValue,
  parseCsvFile,
  parseRadiologyCpt,
} from './import.utils';
import { LookupSyncHelper } from './lookup-sync.helper';

@Injectable()
export class RadiologyCptCodesImportService {
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
        'TRUNCATE TABLE "radiology_cpt_codes" RESTART IDENTITY',
      );
    }

    const rows = parseCsvFile(filePath);
    let upserted = 0;
    let skipped = 0;
    let batch: { cpt: string }[] = [];

    for (const row of rows) {
      const cpt = parseRadiologyCpt(getCsvValue(row, 0));
      if (cpt === null) {
        skipped += 1;
        continue;
      }

      batch.push({ cpt });
      if (batch.length >= chunkSize) {
        upserted += await this.upsertBatch(batch);
        batch = [];
      }
    }

    if (batch.length > 0) {
      upserted += await this.upsertBatch(batch);
    }

    await this.lookupSync.syncTable('radiology_cpt_codes');

    return { upserted, skipped };
  }

  private async upsertBatch(batch: { cpt: string }[]): Promise<number> {
    const unique = dedupeBatchByKey(batch, 'cpt');
    await this.prisma.$transaction(
      unique.map((row) =>
        this.prisma.radiologyCptCode.upsert({
          where: { cpt: row.cpt },
          create: { cpt: row.cpt, isActive: true },
          update: { isActive: true },
        }),
      ),
    );
    return unique.length;
  }
}
