import { Injectable } from '@nestjs/common';
import { readFileSync } from 'fs';
import * as path from 'path';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { CodeListImportOptions, CodeListImportResult } from './import.types';
import {
  getMappedColumnValue,
  loadExcelRows,
  mapModifierSequenceExcelColumns,
  normalizeHeader,
  parseModifierSequenceOrder,
} from './import.utils';
import { LookupSyncHelper } from './lookup-sync.helper';

interface ModifierSequenceRow {
  sequenceOrder: number;
  modifier: string;
  modifierGroup: string;
  isActive: boolean;
}

@Injectable()
export class ModifierSequencesImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lookupSync: LookupSyncHelper,
  ) {}

  async importFromFile(
    filePath: string,
    options: CodeListImportOptions = {},
  ): Promise<CodeListImportResult> {
    const ext = path.extname(filePath).toLowerCase();

    if (options.truncate) {
      await this.prisma.$executeRawUnsafe('TRUNCATE TABLE "modifier_sequences" RESTART IDENTITY');
    }

    if (ext === '.json') {
      return this.importFromJson(filePath);
    }
    if (ext !== '.xlsx' && ext !== '.xls') {
      throw new Error('Unsupported file type. Use .xlsx, .xls, or .json');
    }
    return this.importFromExcel(filePath, options);
  }

  private async importFromExcel(
    filePath: string,
    options: CodeListImportOptions,
  ): Promise<CodeListImportResult> {
    const chunkSize = Math.max(1, options.chunk ?? 500);
    const rows = await loadExcelRows(filePath);
    if (rows.length === 0) {
      throw new Error('Excel file is empty.');
    }

    const headers = (rows[0] ?? []).map((header) => normalizeHeader(String(header ?? '')));
    const columnMap = mapModifierSequenceExcelColumns(headers);
    if (columnMap.sequence_order === undefined || columnMap.modifier === undefined) {
      throw new Error('Could not find required columns. Expected Order and Modifier columns.');
    }

    let upserted = 0;
    let skipped = 0;
    let batch: ModifierSequenceRow[] = [];

    for (const row of rows.slice(1)) {
      const modifierRaw = getMappedColumnValue(row, columnMap, 'modifier');
      const sequenceOrder = parseModifierSequenceOrder(
        getMappedColumnValue(row, columnMap, 'sequence_order'),
      );

      if (modifierRaw === null || sequenceOrder === null) {
        skipped += 1;
        continue;
      }

      batch.push({
        sequenceOrder,
        modifier: modifierRaw.toUpperCase(),
        modifierGroup: getMappedColumnValue(row, columnMap, 'modifier_group') ?? '',
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

    await this.lookupSync.syncTable('modifier_sequences');
    return { upserted, skipped };
  }

  private async importFromJson(filePath: string): Promise<CodeListImportResult> {
    const content = readFileSync(filePath, 'utf8');
    const data = JSON.parse(content) as
      | { sequences?: ModifierSequenceJson[] }
      | ModifierSequenceJson[];
    const records = Array.isArray(data) ? data : (data.sequences ?? []);

    let upserted = 0;
    let skipped = 0;
    let batch: ModifierSequenceRow[] = [];
    const chunkSize = 1000;

    for (const recordData of records) {
      const modifier = recordData.modifier?.trim() ?? '';
      if (modifier === '' || recordData.sequence_order === undefined) {
        skipped += 1;
        continue;
      }

      batch.push({
        sequenceOrder: Math.trunc(Number(recordData.sequence_order)),
        modifier: modifier.toUpperCase(),
        modifierGroup: recordData.modifier_group ?? '',
        isActive: recordData.is_active ?? true,
      });

      if (batch.length >= chunkSize) {
        upserted += await this.upsertBatch(batch);
        batch = [];
      }
    }

    if (batch.length > 0) {
      upserted += await this.upsertBatch(batch);
    }

    await this.lookupSync.syncTable('modifier_sequences');
    return { upserted, skipped };
  }

  private dedupeByModifier(batch: ModifierSequenceRow[]): ModifierSequenceRow[] {
    const unique = new Map<string, ModifierSequenceRow>();
    for (const row of batch) {
      unique.set(row.modifier, row);
    }
    return [...unique.values()];
  }

  private async upsertBatch(batch: ModifierSequenceRow[]): Promise<number> {
    const unique = this.dedupeByModifier(batch);
    await this.prisma.$transaction(
      unique.map((row) =>
        this.prisma.modifierSequence.upsert({
          where: { modifier: row.modifier },
          create: {
            modifier: row.modifier,
            sequenceOrder: row.sequenceOrder,
            modifierGroup: row.modifierGroup,
            isActive: row.isActive,
          },
          update: {
            sequenceOrder: row.sequenceOrder,
            modifierGroup: row.modifierGroup,
            isActive: row.isActive,
          },
        }),
      ),
    );
    return unique.length;
  }
}

interface ModifierSequenceJson {
  modifier?: string;
  sequence_order?: number;
  modifier_group?: string;
  is_active?: boolean;
}
