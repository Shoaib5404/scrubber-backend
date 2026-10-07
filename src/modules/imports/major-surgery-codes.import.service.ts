import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { CodeListImportOptions, CodeListImportResult } from './import.types';
import {
  dedupeBatchByKey,
  getCsvValue,
  parseAlphanumericCode,
  parseCsvFile,
} from './import.utils';
import { LookupSyncHelper } from './lookup-sync.helper';

@Injectable()
export class MajorSurgeryCodesImportService {
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
        'TRUNCATE TABLE "major_surgery_codes" RESTART IDENTITY',
      );
    }

    const rows = parseCsvFile(filePath);
    let upserted = 0;
    let skipped = 0;
    let batch: { code: string }[] = [];

    for (const row of rows) {
      const code = parseAlphanumericCode(getCsvValue(row, 0));
      if (code === null) {
        skipped += 1;
        continue;
      }

      batch.push({ code });
      if (batch.length >= chunkSize) {
        upserted += await this.upsertBatch(batch);
        batch = [];
      }
    }

    if (batch.length > 0) {
      upserted += await this.upsertBatch(batch);
    }

    await this.lookupSync.syncTable('major_surgery_codes');

    return { upserted, skipped };
  }

  private async upsertBatch(batch: { code: string }[]): Promise<number> {
    const unique = dedupeBatchByKey(batch, 'code');
    await this.prisma.$transaction(
      unique.map((row) =>
        this.prisma.majorSurgeryCode.upsert({
          where: { code: row.code },
          create: { code: row.code, active: true },
          update: { active: true },
        }),
      ),
    );
    return unique.length;
  }
}
