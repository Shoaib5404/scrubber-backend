import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { BcbsClaimRoutingsImportResult, CodeListImportOptions } from './import.types';
import {
  buildBcbsClaimRoutingColumns,
  dedupeBatchByCompositeKey,
  getCsvValue,
  parseAlphanumericCode,
  parseCsvFile,
} from './import.utils';
import { LookupSyncHelper } from './lookup-sync.helper';

@Injectable()
export class BcbsClaimRoutingsImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lookupSync: LookupSyncHelper,
  ) {}

  async importFromFile(
    filePath: string,
    options: CodeListImportOptions = {},
  ): Promise<BcbsClaimRoutingsImportResult> {
    const chunkSize = Math.max(1, options.chunk ?? 500);

    if (options.truncate) {
      await this.prisma.$executeRawUnsafe(
        'TRUNCATE TABLE "bcbs_claim_routings" RESTART IDENTITY',
      );
    }

    const allRows = parseCsvFile(filePath);
    if (allRows.length < 2) {
      throw new Error('CSV must contain a description row and a payer ID row.');
    }

    const descriptions = allRows[0] ?? [];
    const payerIds = allRows[1] ?? [];
    const columns = buildBcbsClaimRoutingColumns(descriptions, payerIds);
    if (columns.length === 0) {
      throw new Error('No valid columns found in CSV header rows.');
    }

    let upserted = 0;
    let duplicates = 0;
    const seenKeys = new Set<string>();
    let batch: {
      prefix: string;
      payerId: string;
      description: string;
    }[] = [];
    const batchByKey = new Map<string, (typeof batch)[number]>();

    for (const row of allRows.slice(2)) {
      for (const column of columns) {
        const prefix = parseAlphanumericCode(getCsvValue(row, column.index));
        if (prefix === null) {
          continue;
        }

        const key = `${prefix}|${column.payerId}`;
        if (seenKeys.has(key)) {
          duplicates += 1;
        }
        seenKeys.add(key);

        batchByKey.set(key, {
          prefix,
          payerId: column.payerId,
          description: column.description,
        });

        if (batchByKey.size >= chunkSize) {
          batch = [...batchByKey.values()];
          upserted += await this.upsertBatch(batch);
          batchByKey.clear();
        }
      }
    }

    if (batchByKey.size > 0) {
      batch = [...batchByKey.values()];
      upserted += await this.upsertBatch(batch);
    }

    await this.lookupSync.syncTable('bcbs_claim_routings');

    return { upserted, duplicates };
  }

  private async upsertBatch(
    batch: { prefix: string; payerId: string; description: string }[],
  ): Promise<number> {
    const unique = dedupeBatchByCompositeKey(
      batch.map((row) => ({
        prefix: row.prefix,
        payerId: row.payerId,
        description: row.description,
      })),
      ['prefix', 'payerId'],
    );

    await this.prisma.$transaction(
      unique.map((row) =>
        this.prisma.bcbsClaimRouting.upsert({
          where: {
            prefix_payerId: { prefix: row.prefix, payerId: row.payerId },
          },
          create: {
            prefix: row.prefix,
            payerId: row.payerId,
            description: row.description,
            isActive: true,
          },
          update: {
            description: row.description,
            isActive: true,
          },
        }),
      ),
    );
    return unique.length;
  }
}
