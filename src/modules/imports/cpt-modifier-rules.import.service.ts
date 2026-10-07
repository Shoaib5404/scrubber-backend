import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  loadExcelRows,
  padCptModifierCode,
  parseCptModifierIsAllowed,
  parseCptModifierPayerId,
} from './import.utils';
import { LookupSyncHelper } from './lookup-sync.helper';

export interface CptModifierRulesImportOptions {
  truncate?: boolean;
  chunk?: number;
  merge?: boolean;
}

export interface CptModifierRulesImportResult {
  imported: number;
  updated: number;
  skipped: number;
  errors: number;
}

interface CptModifierRuleRow {
  cptCode: string;
  modifierCode: string;
  isAllowed: boolean;
  payerId: string | null;
  isActive: boolean;
}

/** Laravel App\Console\Commands\ImportCptModifierRules (cpt:import-modifier). */
@Injectable()
export class CptModifierRulesImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lookupSync: LookupSyncHelper,
  ) {}

  async importFromFile(
    filePath: string,
    options: CptModifierRulesImportOptions = {},
  ): Promise<CptModifierRulesImportResult> {
    if (options.truncate) {
      await this.prisma.$executeRawUnsafe('TRUNCATE TABLE "cpt_modifier_rules" RESTART IDENTITY');
    }

    const chunkSize = Math.max(1, options.chunk ?? 1000);
    const merge = options.merge ?? false;

    const rows = await loadExcelRows(filePath);
    if (rows.length === 0) {
      throw new Error('Excel file is empty.');
    }

    let imported = 0;
    let updated = 0;
    let skipped = 0;
    let errors = 0;
    let batch: CptModifierRuleRow[] = [];

    for (const row of rows.slice(1)) {
      const cptRaw = (row[0] ?? '').trim();
      const modRaw = (row[1] ?? '').trim();

      if (cptRaw === '' || modRaw === '') {
        skipped += 1;
        continue;
      }

      batch.push({
        cptCode: cptRaw,
        modifierCode: padCptModifierCode(modRaw),
        isAllowed: parseCptModifierIsAllowed(row[2] ?? null),
        payerId: parseCptModifierPayerId(row[3] ?? null),
        isActive: true,
      });

      if (batch.length >= chunkSize) {
        try {
          const counts = await this.persistBatch(batch, merge);
          imported += counts.imported;
          updated += counts.updated;
        } catch {
          errors += batch.length;
        }
        batch = [];
      }
    }

    if (batch.length > 0) {
      try {
        const counts = await this.persistBatch(batch, merge);
        imported += counts.imported;
        updated += counts.updated;
      } catch {
        errors += batch.length;
      }
    }

    if (errors === 0) {
      await this.lookupSync.syncTables(['cpt_modifier_rules', 'cpt_modifier_rules_by_cpt']);
    }

    return { imported, updated, skipped, errors };
  }

  private dedupeBatch(batch: CptModifierRuleRow[]): CptModifierRuleRow[] {
    const unique = new Map<string, CptModifierRuleRow>();
    for (const row of batch) {
      unique.set(`${row.cptCode}|${row.modifierCode}|${row.payerId ?? ''}`, row);
    }
    return [...unique.values()];
  }

  private async persistBatch(
    batch: CptModifierRuleRow[],
    merge: boolean,
  ): Promise<{ imported: number; updated: number }> {
    const records = this.dedupeBatch(batch);
    if (records.length === 0) {
      return { imported: 0, updated: 0 };
    }

    if (!merge) {
      const result = await this.prisma.cptModifierRule.createMany({
        data: records.map((row) => ({
          cptCode: row.cptCode,
          modifierCode: row.modifierCode,
          isAllowed: row.isAllowed,
          payerId: row.payerId,
          isActive: row.isActive,
        })),
        skipDuplicates: true,
      });
      return { imported: result.count, updated: 0 };
    }

    // Postgres treats NULL as distinct within a compound unique index, so Prisma's generated
    // compound-unique selector cannot target rows where payerId is null. Fall back to
    // findFirst + update/create for those rows (see SP-8 Task 19 group 7 plan).
    for (const row of records) {
      if (row.payerId === null) {
        const existing = await this.prisma.cptModifierRule.findFirst({
          where: { cptCode: row.cptCode, modifierCode: row.modifierCode, payerId: null },
        });
        if (existing) {
          await this.prisma.cptModifierRule.update({
            where: { id: existing.id },
            data: { isAllowed: row.isAllowed, isActive: row.isActive },
          });
        } else {
          await this.prisma.cptModifierRule.create({
            data: {
              cptCode: row.cptCode,
              modifierCode: row.modifierCode,
              isAllowed: row.isAllowed,
              payerId: null,
              isActive: row.isActive,
            },
          });
        }
      } else {
        await this.prisma.cptModifierRule.upsert({
          where: {
            cptCode_modifierCode_payerId: {
              cptCode: row.cptCode,
              modifierCode: row.modifierCode,
              payerId: row.payerId,
            },
          },
          create: {
            cptCode: row.cptCode,
            modifierCode: row.modifierCode,
            isAllowed: row.isAllowed,
            payerId: row.payerId,
            isActive: row.isActive,
          },
          update: { isAllowed: row.isAllowed, isActive: row.isActive },
        });
      }
    }
    return { imported: 0, updated: records.length };
  }
}
