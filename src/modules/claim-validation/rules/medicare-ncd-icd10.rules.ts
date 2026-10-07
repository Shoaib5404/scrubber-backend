import { ClaimIssue } from '../types';

/** Laravel MedicareNcdIcd10Rules */
export const NCD_ICD_001 = 'NCD-ICD-001';
export const NCD_ICD_REJECTION_MESSAGE =
  'ICD code %s is not covered for procedure code %s under Medicare NCD guidelines.';

const MEDICARE_FILING_INDICATORS: readonly string[] = ['MA', 'MB'];

export type MedicareNcdServiceLineInput = {
  lineNumber: number;
  procedureCode: string | null;
  diagnosisPointers?: readonly (number | string)[];
};

export type MedicareNcdDiagnosisInput = {
  sequence: number;
  code: string | null;
};

export type MedicareNcdClaimInput = {
  claimFilingIndicator: string | null;
};

/** Laravel MedicareNcdIcd10Rules::isApplicable */
export function isApplicableMedicareNcdIcd10(claim: MedicareNcdClaimInput): boolean {
  const indicator = String(claim.claimFilingIndicator ?? '')
    .trim()
    .toUpperCase();
  return MEDICARE_FILING_INDICATORS.includes(indicator);
}

/**
 * Laravel MedicareNcdIcd10Rules::validate
 *
 * @param deniedByCpt CPT (uppercase) -> normalized ICD -> true for resolution-code-2 pairs
 *   from `ncd_denied_icd_pairs` lookup cache.
 */
export function validateMedicareNcdIcd10(
  lines: readonly MedicareNcdServiceLineInput[],
  claim: MedicareNcdClaimInput,
  diagnoses: readonly MedicareNcdDiagnosisInput[],
  deniedByCpt: Readonly<Record<string, Readonly<Record<string, true>> | undefined>>,
): ClaimIssue[] {
  if (!isApplicableMedicareNcdIcd10(claim) || lines.length === 0 || diagnoses.length === 0) {
    return [];
  }

  const diagnosesBySequence = new Map<number, MedicareNcdDiagnosisInput>();
  for (const d of diagnoses) {
    diagnosesBySequence.set(d.sequence, d);
  }

  const pairs: {
    line: MedicareNcdServiceLineInput;
    cpt: string;
    icdDisplay: string;
    icdNorm: string;
  }[] = [];

  for (const line of lines) {
    const cptCode = String(line.procedureCode ?? '')
      .trim()
      .toUpperCase();
    if (cptCode === '') {
      continue;
    }

    for (const pointer of line.diagnosisPointers ?? []) {
      const diagnosis = diagnosesBySequence.get(Number(pointer));
      if (!diagnosis) {
        continue;
      }

      const icdDisplay = String(diagnosis.code ?? '').trim();
      if (icdDisplay === '') {
        continue;
      }

      const icdNorm = normalizeIcd(icdDisplay);
      if (icdNorm === '') {
        continue;
      }

      pairs.push({ line, cpt: cptCode, icdDisplay, icdNorm });
    }
  }

  if (pairs.length === 0 || Object.keys(deniedByCpt).length === 0) {
    return [];
  }

  const errors: ClaimIssue[] = [];
  const reported: Record<string, true> = {};

  for (const pair of pairs) {
    const dedupeKey = `${pair.line.lineNumber}:${pair.cpt}:${pair.icdNorm}`;
    if (reported[dedupeKey]) {
      continue;
    }

    const deniedForCpt = deniedByCpt[pair.cpt];
    if (!deniedForCpt || deniedForCpt[pair.icdNorm] !== true) {
      continue;
    }

    reported[dedupeKey] = true;
    errors.push({
      rule: NCD_ICD_001,
      field: `service_lines.${pair.line.lineNumber}.diagnosis_pointers`,
      message: formatNcdRejectionMessage(pair.icdDisplay, pair.cpt),
      severity: 'error',
    });
  }

  return errors;
}

function formatNcdRejectionMessage(icdDisplay: string, cptCode: string): string {
  let msg = NCD_ICD_REJECTION_MESSAGE;
  msg = msg.replace('%s', icdDisplay);
  msg = msg.replace('%s', cptCode);
  return msg;
}

function normalizeIcd(code: string): string {
  return code.toUpperCase().replace(/\./g, '').trim();
}
