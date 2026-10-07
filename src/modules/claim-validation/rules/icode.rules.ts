import { ClaimIssue } from '../types';

/** Laravel ICodeRules::RULE_CODE */
export const HCPCS_I_001 = 'HCPCS-I-001';

/** Laravel ICodeRules::REJECTION_MESSAGE */
export const HCPCS_I_001_MESSAGE =
  'This claim is rejected by Medicare due to HCPCS. This is a status I HCPCS code which is not payable by Medicare.';

const MEDICARE_FILING_INDICATORS: readonly string[] = ['MA', 'MB'];

export type ICodeServiceLineInput = {
  lineNumber: number;
  procedureCode: string | null;
};

export type ICodeClaimInput = {
  claimFilingIndicator: string | null;
};

/**
 * Laravel ICodeRules — rejects MA/MB (Medicare) claims billing a Medicare status-I
 * HCPCS code on any service line.
 *
 * @param statusICodeSet Set (as a Record keyed by normalized code -> `true`) of
 *   normalized (uppercase, trimmed) HCPCS codes present in the active `i_codes` lookup
 *   table (Laravel: `LookupCacheService::existsMany('i_codes', codes)`). Callers may scope
 *   this to only the claim's distinct billed procedure codes.
 */
export function validateICode(
  lines: ICodeServiceLineInput[],
  claim: ICodeClaimInput,
  statusICodeSet: Readonly<Record<string, true>>,
): ClaimIssue[] {
  const indicator = String(claim.claimFilingIndicator ?? '')
    .trim()
    .toUpperCase();
  if (!MEDICARE_FILING_INDICATORS.includes(indicator)) return [];

  const lines_ = lines.filter((line) => String(line.procedureCode ?? '').trim() !== '');
  if (lines_.length === 0) return [];
  if (Object.keys(statusICodeSet).length === 0) return [];

  const errors: ClaimIssue[] = [];
  for (const line of lines_) {
    const code = String(line.procedureCode ?? '')
      .trim()
      .toUpperCase();
    if (!statusICodeSet[code]) continue;

    errors.push({
      rule: HCPCS_I_001,
      field: `service_lines.${line.lineNumber}.procedure_code`,
      message: `Line ${line.lineNumber}: ${HCPCS_I_001_MESSAGE}`,
      severity: 'error',
    });
  }

  return errors;
}
