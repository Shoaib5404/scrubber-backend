import { Prisma } from '@prisma/client';
import { mapChapterCode } from './icd10-tabular-chapter-ranges';
import { DiagnosisNode } from './icd10-tabular.types';

export type Icd10TabularTx = Prisma.TransactionClient;

export interface Icd10TabularWriteStats {
  processed: number;
}

/**
 * Port of Laravel App\Services\ImportLibs\Icd10Parser\Icd10TabularImportWriter::saveTree.
 * `mapChapterCode` runs here (write time), not in the parser. Hyphenated, non-billable, childless
 * nodes (empty section-range placeholders) are skipped entirely (not inserted, but still counted
 * as processed). A node is billable iff it has no children.
 */
export async function saveIcd10TabularTree(
  tx: Icd10TabularTx,
  diagnosisList: DiagnosisNode[],
  parentId: number,
  effectiveStart: Date,
  stats: Icd10TabularWriteStats,
): Promise<void> {
  for (const diagnosis of diagnosisList) {
    if (diagnosis.isChapter) {
      diagnosis.code = mapChapterCode(diagnosis.code);
    }

    if (diagnosis.code.includes('-') && !diagnosis.isBillable && diagnosis.diagnosis.length === 0) {
      stats.processed += 1;
      continue;
    }

    if (diagnosis.diagnosis.length > 0) {
      const id = await insertIcd10TabularCode(tx, diagnosis, parentId, effectiveStart, false);
      stats.processed += 1;
      await saveIcd10TabularTree(tx, diagnosis.diagnosis, id, effectiveStart, stats);
    } else {
      await insertIcd10TabularCode(tx, diagnosis, parentId, effectiveStart, true);
      stats.processed += 1;
    }
  }
}

async function insertIcd10TabularCode(
  tx: Icd10TabularTx,
  diagnosis: DiagnosisNode,
  parentId: number,
  effectiveStart: Date,
  isBillable: boolean,
): Promise<number> {
  const created = await tx.icd10TabularCode.create({
    data: {
      code: diagnosis.code,
      isSection: diagnosis.isSection,
      isChapter: diagnosis.isChapter,
      isBillable,
      effectiveStartDate: effectiveStart,
      parentId: parentId > 0 ? parentId : undefined,
    },
  });

  if (diagnosis.descriptions.length > 0) {
    await tx.icd10TabularCodeDescription.createMany({
      data: diagnosis.descriptions.map((desc) => ({
        icd10TabularCodeId: created.id,
        description: desc.description,
        descriptionType: desc.descriptionType,
      })),
    });
  }

  return created.id;
}
