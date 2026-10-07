import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  loadExcelRows,
  padCptPosCptCode,
  padCptPosPosCode,
  parseCptPosIsDeleted,
  parseCptPosPayerId,
} from './import.utils';
import { LookupSyncHelper } from './lookup-sync.helper';

export interface CptPosRulesImportOptions {
  truncate?: boolean;
  chunk?: number;
  merge?: boolean;
}

export interface CptPosRulesImportResult {
  imported: number;
  updated: number;
  skipped: number;
  errors: number;
}

interface CptPosRuleRow {
  cptCode: string;
  posCode: string;
  payerId: string | null;
  isDeleted: boolean;
}

/** Laravel App\Console\Commands\ImportCptPosRules (cpt:import-pos). */
@Injectable()
export class CptPosRulesImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lookupSync: LookupSyncHelper,
  ) {}

  async importFromFile(
    filePath: string,
    options: CptPosRulesImportOptions = {},
  ): Promise<CptPosRulesImportResult> {
    if (options.truncate) {
      await this.prisma.$executeRawUnsafe('TRUNCATE TABLE "cpt_pos_rules" RESTART IDENTITY');
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
    let batch: CptPosRuleRow[] = [];

    for (const row of rows.slice(1)) {
      const cptRaw = (row[0] ?? '').trim();
      const posRaw = (row[1] ?? '').trim();

      if (cptRaw === '' || posRaw === '') {
        skipped += 1;
        continue;
      }

      const cptCode = padCptPosCptCode(cptRaw);
      const posCode = padCptPosPosCode(posRaw);
      if (!/^\d{2}$/.test(posCode)) {
        skipped += 1;
        continue;
      }

      const payerId = parseCptPosPayerId(row[2] ?? null);
      const isDeleted = parseCptPosIsDeleted(row[3] ?? null);

      batch.push({ cptCode, posCode, payerId, isDeleted });

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
      await this.lookupSync.syncTables(['cpt_pos_rules', 'cpt_pos_rules_by_cpt']);
    }

    return { imported, updated, skipped, errors };
  }

  private dedupeBatch(batch: CptPosRuleRow[]): CptPosRuleRow[] {
    const unique = new Map<string, CptPosRuleRow>();
    for (const row of batch) {
      unique.set(`${row.cptCode}|${row.posCode}|${row.payerId ?? ''}`, row);
    }
    return [...unique.values()];
  }

  private async persistBatch(
    batch: CptPosRuleRow[],
    merge: boolean,
  ): Promise<{ imported: number; updated: number }> {
    const records = this.dedupeBatch(batch);
    if (records.length === 0) {
      return { imported: 0, updated: 0 };
    }

    if (!merge) {
      const result = await this.prisma.cptPosRule.createMany({
        data: records.map((row) => ({
          cptCode: row.cptCode,
          posCode: row.posCode,
          payerId: row.payerId,
          isDeleted: row.isDeleted,
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
        const existing = await this.prisma.cptPosRule.findFirst({
          where: { cptCode: row.cptCode, posCode: row.posCode, payerId: null },
        });
        if (existing) {
          await this.prisma.cptPosRule.update({
            where: { id: existing.id },
            data: { isDeleted: row.isDeleted },
          });
        } else {
          await this.prisma.cptPosRule.create({
            data: { cptCode: row.cptCode, posCode: row.posCode, payerId: null, isDeleted: row.isDeleted },
          });
        }
      } else {
        await this.prisma.cptPosRule.upsert({
          where: {
            cptCode_posCode_payerId: { cptCode: row.cptCode, posCode: row.posCode, payerId: row.payerId },
          },
          create: {
            cptCode: row.cptCode,
            posCode: row.posCode,
            payerId: row.payerId,
            isDeleted: row.isDeleted,
          },
          update: { isDeleted: row.isDeleted },
        });
      }
    }
    return { imported: 0, updated: records.length };
  }
}
