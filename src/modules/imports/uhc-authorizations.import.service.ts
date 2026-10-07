import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { CodeListImportOptions, UhcAuthorizationsImportResult } from './import.types';
import { getCsvValue, mapUhcAuthorizationColumns, parseCsvFile } from './import.utils';
import { LookupSyncHelper } from './lookup-sync.helper';
import {
  isUhcAuthorizationIcdCondition,
  slugForUhcAuthorizationDescription,
} from './uhc-authorization-condition-map';
import { UhcAuthorizationConditionValuesNormalizer } from './uhc-authorization-condition-values.normalizer';

@Injectable()
export class UhcAuthorizationsImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lookupSync: LookupSyncHelper,
    private readonly valuesNormalizer: UhcAuthorizationConditionValuesNormalizer,
  ) {}

  async importFromFile(
    filePath: string,
    options: CodeListImportOptions = {},
  ): Promise<UhcAuthorizationsImportResult> {
    const chunkSize = Math.max(100, options.chunk ?? 500);

    if (options.truncate) {
      await this.prisma.$executeRawUnsafe(
        'TRUNCATE TABLE "uhc_authorizations" RESTART IDENTITY',
      );
    }

    const allRows = parseCsvFile(filePath);
    if (allRows.length === 0) {
      throw new Error('CSV file is empty.');
    }

    const columnMap = mapUhcAuthorizationColumns(allRows[0] ?? []);
    if (columnMap.cptCode === undefined) {
      throw new Error('Could not find CPT / Procedure Codes column in CSV header.');
    }

    const cptCol = columnMap.cptCode;
    const descriptionCol = columnMap.description ?? null;
    const diagnosisCol = columnMap.diagnosis ?? null;

    let imported = 0;
    let skipped = 0;
    let errors = 0;
    const countsByCondition: Record<string, number> = {};
    let batch: {
      cptCode: string;
      condition: string;
      conditionValues: string | null;
    }[] = [];

    for (const row of allRows.slice(1)) {
      const cptCode = (getCsvValue(row, cptCol) ?? '').trim();
      if (cptCode === '') {
        skipped += 1;
        continue;
      }

      const description = (getCsvValue(row, descriptionCol) ?? '').trim();
      const diagnosis = getCsvValue(row, diagnosisCol);

      const condition = slugForUhcAuthorizationDescription(description);
      if (condition === null) {
        errors += 1;
        continue;
      }

      let conditionValues: string | null;
      try {
        conditionValues = await this.valuesNormalizer.normalize(
          condition,
          description,
          diagnosis,
        );
      } catch {
        errors += 1;
        continue;
      }

      if (
        isUhcAuthorizationIcdCondition(condition) &&
        (conditionValues === null || conditionValues === '')
      ) {
        errors += 1;
        continue;
      }

      batch.push({
        cptCode,
        condition,
        conditionValues,
      });
      countsByCondition[condition] = (countsByCondition[condition] ?? 0) + 1;

      if (batch.length >= chunkSize) {
        imported += await this.persistBatch(batch);
        batch = [];
      }
    }

    if (batch.length > 0) {
      imported += await this.persistBatch(batch);
    }

    if (errors === 0) {
      await this.lookupSync.syncTables(['uhc_authorizations', 'uhc_authorizations_by_cpt']);
    }

    return { imported, skipped, errors, countsByCondition };
  }

  private async persistBatch(
    batch: { cptCode: string; condition: string; conditionValues: string | null }[],
  ): Promise<number> {
    await this.prisma.$transaction(
      batch.map((row) =>
        this.prisma.uhcAuthorization.create({
          data: {
            cptCode: row.cptCode,
            condition: row.condition,
            conditionValues: row.conditionValues,
            isActive: true,
          },
        }),
      ),
    );
    return batch.length;
  }
}
