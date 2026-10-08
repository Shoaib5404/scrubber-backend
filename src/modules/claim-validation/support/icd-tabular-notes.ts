import { DescriptionType } from '../../imports/icd10-tabular/icd10-tabular.types';
import { IcdTabularNotesByCode } from '../rules/icd-diagnosis.rules';

/** Instructional note types used by Laravel IcdDiagnosisRules::loadNotesByDiagnosisCode. */
export const ICD_NOTE_DESCRIPTION_TYPES: readonly number[] = [
  DescriptionType.AdditionalCodeNote,
  DescriptionType.Exclude1Note,
  DescriptionType.Exclude2Note,
  DescriptionType.CodeFirstNote,
];

export function normalizeIcdCode(code: string | null | undefined): string {
  return String(code ?? '')
    .replace(/\./g, '')
    .trim()
    .toUpperCase();
}

/** Insert ICD-10 decimal after 3rd character when length > 3 (Laravel withDot). */
export function withIcdDot(norm: string): string {
  if (norm.length <= 3) return norm;
  return `${norm.slice(0, 3)}.${norm.slice(3)}`;
}

/** Candidate DB codes for a diagnosis (undotted + dotted). */
export function icdLookupCandidates(diagnosisCodes: string[]): string[] {
  const set = new Set<string>();
  for (const code of diagnosisCodes) {
    const norm = normalizeIcdCode(code);
    if (!norm) continue;
    set.add(norm);
    set.add(withIcdDot(norm));
  }
  return [...set];
}

export type IcdTabularCodeRow = {
  id: number;
  code: string;
  isBillable: boolean;
};

export type IcdTabularNoteRow = {
  icd10TabularCodeId: number;
  descriptionType: number;
  description: string;
};

/**
 * Assemble notesByNormalizedCode from leaf tabular rows, ancestor id chains, and description rows.
 * Mirrors Laravel IcdDiagnosisRules::loadNotesByDiagnosisCode aggregation.
 */
export function assembleNotesByNormalizedCode(
  codeRows: readonly IcdTabularCodeRow[],
  ancestorIdsByLeafId: ReadonlyMap<number, readonly number[]>,
  noteRows: readonly IcdTabularNoteRow[],
): IcdTabularNotesByCode {
  const notesByHolderId = new Map<number, Array<{ descriptionType: number; description: string }>>();
  for (const row of noteRows) {
    const list = notesByHolderId.get(row.icd10TabularCodeId) ?? [];
    list.push({
      descriptionType: row.descriptionType,
      description: row.description,
    });
    notesByHolderId.set(row.icd10TabularCodeId, list);
  }

  const out: Record<string, Record<number, string[]>> = {};
  for (const row of codeRows) {
    const leafNorm = normalizeIcdCode(row.code);
    if (!leafNorm) continue;
    const leafId = row.id;
    const holders = ancestorIdsByLeafId.get(leafId) ?? [leafId];
    for (const holderId of holders) {
      for (const note of notesByHolderId.get(holderId) ?? []) {
        const byType = (out[leafNorm] ??= {});
        const list = (byType[note.descriptionType] ??= []);
        list.push(note.description);
      }
    }
  }
  return out;
}
