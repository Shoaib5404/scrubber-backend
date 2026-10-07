import { ClaimIssue } from '../types';

/** Laravel Cigna62308AllowedIcdRules::PAYER_ID */
export const CIGNA_62308_PAYER_ID = '62308';

/** Laravel Cigna62308AllowedIcdRules::RULE_CODE */
export const CIGNA_ICD_001 = 'CIGNA-ICD-001';

/** Laravel Cigna62308AllowedIcdRules::MIN_AGE_YEARS */
export const CIGNA_62308_MIN_AGE_YEARS = 18;

/**
 * Laravel Cigna62308AllowedIcdRules::HCPCS_CODES (Cigna HCPCS library, sourced from
 * import/CPT-ICD-crosswalk-for-cigna.xlsx HCPCS sheet).
 */
export const CIGNA_62308_HCPCS_CODES: readonly string[] = [
  '93303',
  '93304',
  '93306',
  '93307',
  '93308',
  '93320',
  '93321',
  '93325',
  'C8921',
  'C8922',
  'C8923',
  'C8924',
  'C8929',
];

export type Cigna62308ServiceLineInput = {
  lineNumber: number;
  procedureCode: string | null;
  /** Raw diagnosis pointer array (indices refer to `Cigna62308DiagnosisInput.sequence`). */
  diagnosisPointers: unknown;
  serviceDateFrom: Date | null;
};

export type Cigna62308DiagnosisInput = {
  sequence: number;
  code: string | null;
};

export type Cigna62308ClaimInput = {
  payerId: string | null;
  patientDob: Date | null;
  subscriberDob: Date | null;
};

/**
 * Laravel Cigna62308AllowedIcdRules::isApplicable — payer 62308 and patient at least
 * 18 years old as of the earliest service line date (or now, if no service dates).
 */
export function isApplicableCigna62308(
  claim: Cigna62308ClaimInput,
  lines: readonly Pick<Cigna62308ServiceLineInput, 'serviceDateFrom'>[],
): boolean {
  if (String(claim.payerId ?? '').trim() !== CIGNA_62308_PAYER_ID) return false;
  return isPatientAtLeastMinAge(claim, lines);
}

/**
 * Laravel Cigna62308AllowedIcdRules — Cigna (62308) allowed ICD-10 diagnoses for select
 * HCPCS codes (patient age 18+).
 *
 * @param allowedIcdsByCpt Normalized (uppercase, trimmed) CPT code -> set (Record of
 *   `true`) of normalized (uppercase, dot-stripped) allowed ICD-10 codes, from the active
 *   `cigna_cpt_icd_crosswalk` idx_map lookup
 *   (`LookupCacheService::getMaps('cigna_cpt_icd_crosswalk', cptCodes)`).
 *
 * Note: Laravel attaches a `details_url` (route `cigna-cpt-icd-crosswalk.index`) to each
 * issue. `ClaimIssue` has no field for it, so it is intentionally omitted here.
 */
export function validateCigna62308(
  lines: Cigna62308ServiceLineInput[],
  diagnoses: Cigna62308DiagnosisInput[],
  claim: Cigna62308ClaimInput,
  allowedIcdsByCpt: Readonly<Record<string, Readonly<Record<string, true>>>>,
): ClaimIssue[] {
  if (!isApplicableCigna62308(claim, lines) || lines.length === 0 || diagnoses.length === 0) {
    return [];
  }

  const applicableLines = lines.filter((line) => isCignaHcpcsCode(line.procedureCode));
  if (applicableLines.length === 0) return [];

  const diagnosesBySequence = new Map(diagnoses.map((diagnosis) => [diagnosis.sequence, diagnosis]));
  const errors: ClaimIssue[] = [];

  for (const line of applicableLines) {
    const cptCode = String(line.procedureCode ?? '')
      .trim()
      .toUpperCase();
    const allowedIcds = allowedIcdsByCpt[cptCode] ?? {};

    for (const pointer of diagnosisPointers(line.diagnosisPointers)) {
      const diagnosis = diagnosesBySequence.get(pointer);
      if (!diagnosis) continue;

      const icdCode = String(diagnosis.code ?? '').trim();
      if (icdCode === '') continue;

      if (allowedIcds[normalizeIcd(icdCode)]) continue;

      errors.push({
        rule: CIGNA_ICD_001,
        field: `service_lines.${line.lineNumber}.diagnosis_pointers`,
        message: `Cigna does not allow the use of ICD ${icdCode} with CPT ${cptCode}. Please click here to see the allowed ICD list.`,
        severity: 'error',
      });
    }
  }

  return errors;
}

function isCignaHcpcsCode(procedureCode: string | null): boolean {
  const normalized = String(procedureCode ?? '')
    .trim()
    .toUpperCase();
  return normalized !== '' && CIGNA_62308_HCPCS_CODES.includes(normalized);
}

function diagnosisPointers(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((pointer) => Number(pointer));
}

function normalizeIcd(code: string): string {
  return code.trim().replace(/\./g, '').toUpperCase();
}

function isPatientAtLeastMinAge(
  claim: Cigna62308ClaimInput,
  lines: readonly Pick<Cigna62308ServiceLineInput, 'serviceDateFrom'>[],
): boolean {
  const dob = claim.patientDob ?? claim.subscriberDob;
  if (!dob) return false;

  const serviceDate = referenceServiceDate(lines);
  if (serviceDate.getTime() < dob.getTime()) return false;

  let age = serviceDate.getUTCFullYear() - dob.getUTCFullYear();
  const monthDiff = serviceDate.getUTCMonth() - dob.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && serviceDate.getUTCDate() < dob.getUTCDate())) {
    age -= 1;
  }
  return age >= CIGNA_62308_MIN_AGE_YEARS;
}

function referenceServiceDate(lines: readonly Pick<Cigna62308ServiceLineInput, 'serviceDateFrom'>[]): Date {
  const dates = lines
    .map((line) => line.serviceDateFrom)
    .filter((date): date is Date => date !== null && date !== undefined);
  if (dates.length === 0) return new Date();
  return new Date(Math.min(...dates.map((date) => date.getTime())));
}
