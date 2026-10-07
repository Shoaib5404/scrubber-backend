import { ClaimIssue } from '../types';

/** Laravel AetnaLcdRules::PAYER_ID */
export const AETNA_LCD_PAYER_ID = '60054';

/** Laravel AetnaLcdRules::RULE_CODE_FETAL */
export const AETNA_FETAL_001 = 'AETNA-FETAL-001';

/** Laravel AetnaLcdRules::RULE_CODE_B12 */
export const AETNA_B12_001 = 'AETNA-B12-001';

/** Laravel AetnaLcdRules::B12_CPT_CODES */
export const AETNA_B12_CPT_CODES: readonly string[] = ['83090', 'J3420'];

/** Laravel AetnaLcdRules::FETAL_POLICY_URL */
export const AETNA_FETAL_POLICY_URL = 'https://www.aetna.com/cpb/medical/data/100_199/0106.html';

/** Laravel AetnaLcdRules::B12_POLICY_URL */
export const AETNA_B12_POLICY_URL = 'http://www.aetna.com/cpb/medical/data/500_599/0536.html';

export type AetnaLcdServiceLineInput = {
  lineNumber: number;
  procedureCode: string | null;
  /** Raw diagnosis pointer array (indices refer to `AetnaLcdDiagnosisInput.sequence`). */
  diagnosisPointers: unknown;
};

export type AetnaLcdDiagnosisInput = {
  sequence: number;
  code: string | null;
};

export type AetnaLcdClaimInput = {
  payerId: string | null;
};

/** Laravel AetnaLcdRules::isApplicable */
export function isApplicableAetnaLcd(claim: AetnaLcdClaimInput): boolean {
  return String(claim.payerId ?? '').trim() === AETNA_LCD_PAYER_ID;
}

/**
 * Laravel AetnaLcdRules — Aetna (60054) allowed ICD-10 diagnoses for the Fetal LCD and
 * B12 LCD CPT crosswalks.
 *
 * @param fetalCptCodes Normalized (uppercase, trimmed) distinct CPT codes from the active
 *   `aetna_fetal_lcd` table. Laravel enumerates this directly from the database
 *   (`AetnaFetalLcd::query()->active()->distinct()->pluck('cpt')`) rather than through the
 *   idx_map cache, since it needs the full distinct-CPT list rather than a single group.
 * @param allowedFetalIcdsByCpt Normalized CPT -> set (Record of `true`) of normalized
 *   (uppercase, dot-stripped) allowed ICD-10 codes, from the active `aetna_fetal_lcd`
 *   idx_map lookup (`LookupCacheService::getMaps('aetna_fetal_lcd', cptCodes)`).
 * @param allowedB12IcdsByCpt Same shape as `allowedFetalIcdsByCpt`, sourced from the
 *   active `aetna_b12_lcd` idx_map lookup, scoped to `AETNA_B12_CPT_CODES`.
 *
 * Note: Laravel attaches a `details_url` (route `aetna-fetal-lcd.index` /
 * `aetna-b12-lcd.index`) to each issue. `ClaimIssue` has no field for it, so it is
 * intentionally omitted here.
 */
export function validateAetnaLcd(
  lines: AetnaLcdServiceLineInput[],
  diagnoses: AetnaLcdDiagnosisInput[],
  claim: AetnaLcdClaimInput,
  fetalCptCodes: readonly string[],
  allowedFetalIcdsByCpt: Readonly<Record<string, Readonly<Record<string, true>>>>,
  allowedB12IcdsByCpt: Readonly<Record<string, Readonly<Record<string, true>>>>,
): ClaimIssue[] {
  if (!isApplicableAetnaLcd(claim) || lines.length === 0 || diagnoses.length === 0) {
    return [];
  }

  const diagnosesBySequence = new Map(diagnoses.map((diagnosis) => [diagnosis.sequence, diagnosis]));
  const fetalLines = lines.filter((line) => isFetalCpt(line.procedureCode, fetalCptCodes));
  const b12Lines = lines.filter((line) => isB12Cpt(line.procedureCode));

  const errors: ClaimIssue[] = [];

  if (fetalLines.length > 0) {
    errors.push(
      ...validateCrosswalk(fetalLines, diagnosesBySequence, allowedFetalIcdsByCpt, AETNA_FETAL_001, AETNA_FETAL_POLICY_URL),
    );
  }

  if (b12Lines.length > 0) {
    errors.push(
      ...validateCrosswalk(b12Lines, diagnosesBySequence, allowedB12IcdsByCpt, AETNA_B12_001, AETNA_B12_POLICY_URL),
    );
  }

  return errors;
}

function validateCrosswalk(
  lines: readonly AetnaLcdServiceLineInput[],
  diagnosesBySequence: ReadonlyMap<number, AetnaLcdDiagnosisInput>,
  allowedIcdsByCpt: Readonly<Record<string, Readonly<Record<string, true>>>>,
  ruleCode: string,
  policyUrl: string,
): ClaimIssue[] {
  const errors: ClaimIssue[] = [];

  for (const line of lines) {
    const cptCode = String(line.procedureCode ?? '')
      .trim()
      .toUpperCase();
    const allowedIcds = allowedIcdsByCpt[cptCode] ?? {};

    for (const pointer of diagnosisPointers(line.diagnosisPointers)) {
      const diagnosis = diagnosesBySequence.get(pointer);
      if (!diagnosis) continue;

      const icdCode = String(diagnosis.code ?? '').trim();
      if (icdCode === '') continue;

      const normalizedIcd = normalizeIcd(icdCode);
      if (normalizedIcd === '' || allowedIcds[normalizedIcd]) continue;

      errors.push({
        rule: ruleCode,
        field: `service_lines.${line.lineNumber}.diagnosis_pointers`,
        message: `HCPCS ${cptCode} does not meet medical necessity, please see the online policy ${policyUrl} and report supportive diagnosis code.`,
        severity: 'error',
      });
    }
  }

  return errors;
}

function isFetalCpt(procedureCode: string | null, fetalCptCodes: readonly string[]): boolean {
  const normalized = String(procedureCode ?? '')
    .trim()
    .toUpperCase();
  return normalized !== '' && fetalCptCodes.includes(normalized);
}

function isB12Cpt(procedureCode: string | null): boolean {
  const normalized = String(procedureCode ?? '')
    .trim()
    .toUpperCase();
  return normalized !== '' && AETNA_B12_CPT_CODES.includes(normalized);
}

function diagnosisPointers(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((pointer) => Number(pointer));
}

function normalizeIcd(code: string): string {
  return code.trim().replace(/\./g, '').toUpperCase();
}
