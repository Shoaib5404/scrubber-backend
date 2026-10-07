import { ClaimIssue } from '../types';

/** Laravel Uhc87726PosRules::PAYER_ID */
export const UHC_87726_PAYER_ID = '87726';

/** Laravel Uhc87726PosRules::RULE_CODE */
export const UHC_POS_001 = 'UHC-POS-001';

export type Uhc87726PosServiceLineInput = {
  lineNumber: number;
  procedureCode: string | null;
  placeOfService: string | null;
};

export type Uhc87726PosClaimInput = {
  payerId: string | null;
  placeOfService: string | null;
};

/** Laravel Uhc87726PosRules::isApplicable */
export function isApplicableUhc87726Pos(claim: Uhc87726PosClaimInput): boolean {
  return String(claim.payerId ?? '').trim() === UHC_87726_PAYER_ID;
}

/**
 * Laravel Uhc87726PosRules — for UHC (87726), each billed CPT must be billed with an
 * allowed place of service per the `uhc_pos_crosswalk` table.
 *
 * @param allowedPosByCpt Normalized (uppercase, trimmed) CPT code -> list of normalized
 *   (2-digit, zero-padded) POS codes allowed for that CPT, from the active
 *   `uhc_pos_crosswalk` idx_map lookup
 *   (`LookupCacheService::getMaps('uhc_pos_crosswalk', cptCodes)`, with each member POS
 *   code zero-padded to 2 digits). A CPT absent from this map is treated as unconstrained
 *   (no error raised), matching Laravel's `$allowedPosCodes === null` continue.
 */
export function validateUhc87726Pos(
  lines: Uhc87726PosServiceLineInput[],
  claim: Uhc87726PosClaimInput,
  allowedPosByCpt: Readonly<Record<string, readonly string[]>>,
): ClaimIssue[] {
  if (!isApplicableUhc87726Pos(claim) || lines.length === 0) return [];

  const errors: ClaimIssue[] = [];

  for (const line of lines) {
    const cptCode = String(line.procedureCode ?? '').trim();
    if (cptCode === '') continue;

    const allowedPosCodes = allowedPosByCpt[cptCode.toUpperCase()];
    if (allowedPosCodes === undefined) continue;

    const posCode = normalizePos(resolvePlaceOfService(line, claim));
    const displayPos = posCode ?? '';

    if (posCode === null || !allowedPosCodes.includes(posCode)) {
      errors.push({
        rule: UHC_POS_001,
        field: `service_lines.${line.lineNumber}.place_of_service`,
        message: `For UHC, procedure code ${cptCode} is inconsistent with current POS ${displayPos}.`,
        severity: 'error',
      });
    }
  }

  return errors;
}

function resolvePlaceOfService(line: Uhc87726PosServiceLineInput, claim: Uhc87726PosClaimInput): string | null {
  const linePos = line.placeOfService;
  if (linePos !== null && String(linePos).trim() !== '') return String(linePos).trim();

  const claimPos = claim.placeOfService;
  if (claimPos !== null && String(claimPos).trim() !== '') return String(claimPos).trim();

  return null;
}

function normalizePos(code: string | null): string | null {
  if (code === null || String(code).trim() === '') return null;
  return String(code).trim().padStart(2, '0');
}
