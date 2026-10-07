import { ClaimIssue } from '../types';

/** Laravel Mue87726Uhc06111OxfordRules::PAYER_IDS */
export const MUE_UHC_OXFORD_PAYER_IDS: readonly string[] = ['87726', '06111'];

/** Laravel Mue87726Uhc06111OxfordRules::RULE_CODE_UNITS */
export const MUE_UHC_001 = 'MUE-UHC-001';

export type MueUhcOxfordServiceLineInput = {
  lineNumber: number;
  procedureCode: string | null;
  units: number;
};

export type MueUhcOxfordClaimInput = {
  payerId: string | null;
};

/** Active `mue_87726_uhc_06111_oxford` row for a CPT code (`min`/`max` allowed units). */
export type MueUhcOxfordLookupRow = {
  min: number;
  max: number;
};

/** Laravel Mue87726Uhc06111OxfordRules::isApplicable */
export function isApplicableMueUhcOxford(claim: MueUhcOxfordClaimInput): boolean {
  return MUE_UHC_OXFORD_PAYER_IDS.includes(String(claim.payerId ?? '').trim());
}

/**
 * Laravel Mue87726Uhc06111OxfordRules::validateUnits — UHC (87726) / Oxford (06111)
 * payer-specific MUE library and units validation.
 *
 * @param mueRowsByCode Normalized (uppercase, trimmed) CPT code -> active
 *   `mue_87726_uhc_06111_oxford` row, from
 *   `LookupCacheService::getMany('mue_87726_uhc_06111_oxford', codes)` (active rows only).
 */
export function validateMueUhcOxford(
  lines: MueUhcOxfordServiceLineInput[],
  claim: MueUhcOxfordClaimInput,
  mueRowsByCode: Readonly<Record<string, MueUhcOxfordLookupRow>>,
): ClaimIssue[] {
  if (!isApplicableMueUhcOxford(claim) || lines.length === 0) return [];

  const errors: ClaimIssue[] = [];

  for (const line of lines) {
    const code = String(line.procedureCode ?? '').trim();
    const mueRow = mueRowsByCode[code.toUpperCase()];
    if (!mueRow) continue;

    if (line.units < mueRow.min || line.units > mueRow.max) {
      errors.push({
        rule: MUE_UHC_001,
        field: `service_lines.${line.lineNumber}.units`,
        message: `Procedure ${code} Units ${formatUnits(line.units)} are not according to UHC/Oxford likely units edits. Please verify and correct the billed units.`,
        severity: 'error',
      });
    }
  }

  return errors;
}

/** Laravel Mue87726Uhc06111OxfordRules::formatUnitsForMessage */
function formatUnits(units: number): string {
  if (!Number.isFinite(units)) return String(units);

  let formatted = units.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
  formatted = formatted === '' ? '0' : formatted;
  return formatted;
}
