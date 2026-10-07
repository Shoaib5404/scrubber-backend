import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { CodeListImportOptions, CodeListImportResult } from './import.types';
import {
  dedupeBatchByKey,
  getCsvValue,
  normalizeHeaders,
  parseCsvFile,
  parseImportActive,
  resolveColumnIndex,
} from './import.utils';
import { LookupSyncHelper } from './lookup-sync.helper';

@Injectable()
export class AnesthesiaModifiersImportService {
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
        'TRUNCATE TABLE "anesthesia_modifiers" RESTART IDENTITY',
      );
    }

    const allRows = parseCsvFile(filePath);
    if (allRows.length === 0) {
      throw new Error('CSV file is empty.');
    }

    const columns = normalizeHeaders(allRows[0] ?? []);
    const modifierCol = resolveColumnIndex(columns, ['modifier'], 0);
    const descriptionCol = resolveColumnIndex(columns, ['description'], 1);
    const activeCol = columns.active ?? null;

    let upserted = 0;
    let skipped = 0;
    let batch: { modifier: string; description: string | null; active: boolean }[] = [];

    for (const row of allRows.slice(1)) {
      const modifier = getCsvValue(row, modifierCol);

      if (modifier === null) {
        skipped += 1;
        continue;
      }

      batch.push({
        modifier,
        description: getCsvValue(row, descriptionCol),
        active: parseImportActive(
          activeCol === null ? null : getCsvValue(row, activeCol),
        ),
      });

      if (batch.length >= chunkSize) {
        upserted += await this.upsertBatch(batch);
        batch = [];
      }
    }

    if (batch.length > 0) {
      upserted += await this.upsertBatch(batch);
    }

    await this.lookupSync.syncTable('anesthesia_modifiers');

    return { upserted, skipped };
  }

  private async upsertBatch(
    batch: { modifier: string; description: string | null; active: boolean }[],
  ): Promise<number> {
    const unique = dedupeBatchByKey(
      batch.map((row) => ({
        modifier: row.modifier,
        description: row.description ?? '',
        active: String(row.active),
      })),
      'modifier',
    ).map((row) => ({
      modifier: row.modifier,
      description: row.description === '' ? null : row.description,
      active: row.active === 'true',
    }));

    await this.prisma.$transaction(
      unique.map((row) =>
        this.prisma.anesthesiaModifier.upsert({
          where: { modifier: row.modifier },
          create: {
            modifier: row.modifier,
            description: row.description,
            active: row.active,
          },
          update: { description: row.description, active: row.active },
        }),
      ),
    );
    return unique.length;
  }
}
