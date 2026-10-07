import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  getCsvValue,
  normalizeHeaders,
  parseCsvFile,
  parseIcd10ActiveFlag,
  parseIcd10ClaimType,
} from './import.utils';
import { LookupSyncHelper } from './lookup-sync.helper';

export interface Icd10UnacceptablePrincipalDxCodesImportOptions {
  truncate?: boolean;
  chunk?: number;
}

export interface Icd10UnacceptablePrincipalDxCodesImportResult {
  upserted: number;
  skipped: number;
}

interface Icd10UnacceptablePrincipalDxCodeRow {
  code: string;
  description: string | null;
  claimType: number;
  active: boolean;
}

/**
 * Laravel App\Console\Commands\ImportIcd10UnacceptablePrincipalDxCodes
 * (icd10-unacceptable-principal-dx-codes:import).
 */
@Injectable()
export class Icd10UnacceptablePrincipalDxCodesImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lookupSync: LookupSyncHelper,
  ) {}

  async importFromFile(
    filePath: string,
    options: Icd10UnacceptablePrincipalDxCodesImportOptions = {},
  ): Promise<Icd10UnacceptablePrincipalDxCodesImportResult> {
    if (options.truncate) {
      await this.prisma.$executeRawUnsafe(
        'TRUNCATE TABLE "icd10_unacceptable_principal_diagnose_codes" RESTART IDENTITY',
      );
    }

    const chunkSize = Math.max(1, options.chunk ?? 1000);

    const allRows = parseCsvFile(filePath);
    if (allRows.length === 0) {
      throw new Error('CSV file is empty.');
    }

    const columns = normalizeHeaders(allRows[0] ?? []);
    const codeCol = columns.code ?? 0;
    const descriptionCol = columns.description ?? 1;
    const claimTypeCol = columns.claim_type ?? columns.claimtype ?? 2;
    const activeCol = columns.active;

    let upserted = 0;
    let skipped = 0;
    let batch: Icd10UnacceptablePrincipalDxCodeRow[] = [];

    for (const row of allRows.slice(1)) {
      const code = getCsvValue(row, codeCol);
      const claimType = parseIcd10ClaimType(getCsvValue(row, claimTypeCol));

      if (code === null || claimType === null) {
        skipped += 1;
        continue;
      }

      batch.push({
        code,
        description: getCsvValue(row, descriptionCol),
        claimType,
        active: parseIcd10ActiveFlag(activeCol === undefined ? null : getCsvValue(row, activeCol)),
      });

      if (batch.length >= chunkSize) {
        upserted += await this.upsertBatch(batch);
        batch = [];
      }
    }

    if (batch.length > 0) {
      upserted += await this.upsertBatch(batch);
    }

    await this.lookupSync.syncTable('icd10_unacceptable_principal_diagnose_codes');

    return { upserted, skipped };
  }

  private dedupeByCodeClaimType(
    batch: Icd10UnacceptablePrincipalDxCodeRow[],
  ): Icd10UnacceptablePrincipalDxCodeRow[] {
    const unique = new Map<string, Icd10UnacceptablePrincipalDxCodeRow>();
    for (const row of batch) {
      unique.set(`${row.code}|${row.claimType}`, row);
    }
    return [...unique.values()];
  }

  private async upsertBatch(batch: Icd10UnacceptablePrincipalDxCodeRow[]): Promise<number> {
    const records = this.dedupeByCodeClaimType(batch);
    if (records.length === 0) {
      return 0;
    }

    await this.prisma.$transaction(
      records.map((row) =>
        this.prisma.icd10UnacceptablePrincipalDiagnoseCode.upsert({
          where: { code_claimType: { code: row.code, claimType: row.claimType } },
          create: {
            code: row.code,
            description: row.description,
            claimType: row.claimType,
            active: row.active,
          },
          update: {
            description: row.description,
            active: row.active,
          },
        }),
      ),
    );
    return records.length;
  }
}
