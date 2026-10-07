import { ClaimIssue } from '../types';

/** Laravel RadiologyTcModifierRules::RULE_CODE */
export const RAD_TC_001 = 'RAD-TC-001';

/** Laravel RadiologyTcModifierRules::TC_MODIFIER */
export const TC_MODIFIER = 'TC';

/** Laravel RadiologyTcModifierRules::FACILITY_POS_CODES */
export const FACILITY_POS_CODES: readonly string[] = [
  '21',
  '22',
  '23',
  '24',
  '26',
  '31',
  '34',
  '41',
  '42',
  '51',
  '52',
  '53',
  '56',
  '61',
];

/**
 * Labels for the facility POS codes above, sourced from `config/common.php`
 * `places_of_service` (Laravel's `formatPosLabel` only ever resolves a code already
 * confirmed to be in `FACILITY_POS_CODES`, so only those entries are needed here).
 */
const FACILITY_POS_LABELS: Readonly<Record<string, string>> = {
  '21': 'Inpatient Hospital',
  '22': 'On-Campus Outpatient Hospital',
  '23': 'Emergency Room - Hospital',
  '24': 'Ambulatory Surgical Center',
  '26': 'Military Treatment Facility',
  '31': 'Skilled Nursing Facility (SNF)',
  '34': 'Hospice',
  '41': 'Ambulance - Land',
  '42': 'Ambulance - Air or Water',
  '51': 'Inpatient Psychiatric Facility',
  '52': 'Psychiatric Facility - Partial Hospitalization',
  '53': 'Community Mental Health Center',
  '56': 'Psychiatric Residential Treatment Center',
  '61': 'Comprehensive Inpatient Rehabilitation Facility',
};

export type RadiologyTcServiceLineInput = {
  lineNumber: number;
  procedureCode: string | null;
  placeOfService: string | null;
  modifier1: string | null;
  modifier2: string | null;
  modifier3: string | null;
  modifier4: string | null;
};

export type RadiologyTcClaimInput = {
  placeOfService: string | null;
};

/**
 * Laravel RadiologyTcModifierRules — radiology procedures billed at a facility place of
 * service must not carry modifier TC; the technical component is the facility's
 * responsibility there.
 *
 * @param radiologyCodeSet Set (as a Record keyed by normalized code -> `true`) of CPT
 *   codes present in the active `radiology_cpt_codes` lookup table. Keys must be
 *   normalized the same way as this file's procedure-code normalization (numeric codes
 *   zero-padded to 5 digits; alpha codes uppercased), matching Laravel's
 *   `normalizeProcedureCode`.
 */
export function validateRadiologyTcModifier(
  lines: RadiologyTcServiceLineInput[],
  claim: RadiologyTcClaimInput,
  radiologyCodeSet: Readonly<Record<string, true>>,
): ClaimIssue[] {
  if (lines.length === 0) return [];
  if (Object.keys(radiologyCodeSet).length === 0) return [];

  const facilityPosLookup = new Set(FACILITY_POS_CODES);
  const errors: ClaimIssue[] = [];

  for (const line of lines) {
    const procedureCode = normalizeProcedureCode(line.procedureCode);
    if (procedureCode === '' || !radiologyCodeSet[procedureCode]) continue;

    const posCode = normalizePos(resolvePlaceOfService(line, claim));
    if (posCode === null || !facilityPosLookup.has(posCode)) continue;

    if (!lineHasTcModifier(line)) continue;

    const posLabel = formatPosLabel(posCode);

    errors.push({
      rule: RAD_TC_001,
      field: `service_lines.${line.lineNumber}.modifiers`,
      message: `Under facility any settings ${posLabel}, technical component of radiology services ${String(line.procedureCode ?? '').trim()} is the responsibility of facility, please remove TC modifier.`,
      severity: 'error',
    });
  }

  return errors;
}

function lineHasTcModifier(line: RadiologyTcServiceLineInput): boolean {
  return [line.modifier1, line.modifier2, line.modifier3, line.modifier4].some(
    (modifier) => normalizeModifier(modifier) === TC_MODIFIER,
  );
}

function normalizeModifier(modifier: string | null): string {
  const m = String(modifier ?? '')
    .trim()
    .toUpperCase();
  if (m === '') return '';
  return m.padStart(2, '0');
}

function normalizeProcedureCode(code: string | null): string {
  const procedureCode = String(code ?? '').trim();
  if (procedureCode === '') return '';
  if (/^\d+$/.test(procedureCode)) return procedureCode.padStart(5, '0');
  return procedureCode.toUpperCase();
}

function resolvePlaceOfService(line: RadiologyTcServiceLineInput, claim: RadiologyTcClaimInput): string | null {
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

function formatPosLabel(posCode: string): string {
  const description = FACILITY_POS_LABELS[posCode];
  if (!description) return posCode;
  return `${posCode} - ${description}`;
}
