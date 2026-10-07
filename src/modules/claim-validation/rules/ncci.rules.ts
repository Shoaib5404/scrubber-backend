import { ClaimIssue } from '../types';

/** Laravel Ncci::MODIFIER_NOT_ALLOWED */
export const NCCI_MODIFIER_NOT_ALLOWED = 0;

/** Laravel Ncci::MODIFIER_ALLOWED */
export const NCCI_MODIFIER_ALLOWED = 1;

/** Laravel Ncci::MODIFIER_NOT_APPLICABLE */
export const NCCI_MODIFIER_NOT_APPLICABLE = 9;

/** Laravel config/common.php `ncci_bypass_modifiers` */
export const NCCI_BYPASS_MODIFIERS: readonly string[] = [
  '73',
  '74',
  'GW',
  'XU',
  'XS',
  'XP',
  'XE',
  'RT',
  'QJ',
  'Q6',
  'Q5',
  'PD',
  'LT',
  'KX',
  'GR',
  'GJ',
  'GC',
  'GA',
  'ET',
  'E4',
  'E3',
  'E2',
  'E1',
  'AR',
  'AQ',
  '99',
  '79',
  '78',
  '77',
  '76',
  '59',
  '58',
  '56',
  '55',
  '54',
  '53',
  '52',
  '51',
  '22',
  'GV',
];

const BYPASS_MODIFIERS_HELP_INTRO =
  'An NCCI-associated modifier may be applied to override this edit when appropriate.';

export type NcciServiceLineInput = {
  lineNumber: number;
  procedureCode: string | null;
  modifier1: string | null;
  modifier2: string | null;
  modifier3: string | null;
  modifier4: string | null;
};

/** Active NCCI PTP row (Laravel `Ncci` model). */
export type NcciPairLookupRow = {
  id: number;
  column1: string;
  column2: string;
  modifier: number;
};

export type NcciValidationResult = {
  errors: ClaimIssue[];
  warnings: ClaimIssue[];
};

/** Laravel NcciRules::bypassModifiersHelpIntro */
export function ncciBypassModifiersHelpIntro(): string {
  return BYPASS_MODIFIERS_HELP_INTRO;
}

/**
 * Laravel NcciRules::validatePairs — DB-threshold path only.
 *
 * Callers supply preloaded PTP rows keyed by `column1|column2` (Laravel:
 * `NcciRulesCacheService::getRulesForClaimCpts`). Redis/cache layer is deferred to the service.
 */
export function validateNcci(
  lines: NcciServiceLineInput[],
  pairsByColumnKey: Readonly<Record<string, readonly NcciPairLookupRow[]>>,
  bypassModifierCodes: readonly string[] = NCCI_BYPASS_MODIFIERS,
): NcciValidationResult {
  const errors: ClaimIssue[] = [];
  const warnings: ClaimIssue[] = [];

  const validLines = lines.filter((l) => String(l.procedureCode ?? '').trim() !== '');
  if (validLines.length < 2) {
    return { errors, warnings };
  }

  if (Object.keys(pairsByColumnKey).length === 0) {
    return { errors, warnings };
  }

  const approvedBypass = ncciApprovedBypassModifierLookup(bypassModifierCodes);

  const count = validLines.length;

  for (let i = 0; i < count; i += 1) {
    for (let j = 0; j < count; j += 1) {
      if (i === j) continue;

      const lineA = validLines[i];
      const lineB = validLines[j];

      const cptA = String(lineA.procedureCode ?? '').trim();
      const cptB = String(lineB.procedureCode ?? '').trim();

      const rules = pairsByColumnKey[`${cptA}|${cptB}`];
      if (!rules || rules.length === 0) continue;

      const applicableRule = rules[0];

      if (applicableRule.modifier === NCCI_MODIFIER_NOT_APPLICABLE) {
        continue;
      }

      if (serviceLineHasModifierIgnoringCase(lineA, 'GV')) {
        errors.push({
          rule: 'NCCI-004',
          field: `service_lines.${lineA.lineNumber}.modifiers`,
          message: `modifier GV cannot be appended to column 1 CPT/HCPCS code ${cptA} in NCCI edits. Please review and correct the modifier`,
          severity: 'error',
        });
        continue;
      }

      if (applicableRule.modifier === NCCI_MODIFIER_NOT_ALLOWED) {
        if (nonEmptyLineModifiersUpper(lineB).length === 0) {
          continue;
        }

        errors.push({
          rule: 'NCCI-001',
          field: `service_lines.${lineB.lineNumber}.procedure_code`,
          message: `CPT/HCPCS code ${cptB} cannot be billed with ${cptA} per NCCI edits. Modifiers are not allowed to override this edit.`,
          severity: 'error',
        });
        continue;
      }

      if (applicableRule.modifier === NCCI_MODIFIER_ALLOWED) {
        const nonEmptyMods = nonEmptyLineModifiersUpper(lineB);

        if (nonEmptyMods.length === 0) {
          errors.push({
            rule: 'NCCI-002',
            field: `service_lines.${lineB.lineNumber}.procedure_code`,
            message: `CPT/HCPCS code ${cptB} requires an appropriate NCCI modifier when billed with ${cptA}. Please add a valid modifier.`,
            severity: 'error',
          });
          continue;
        }

        const invalid = firstNonApprovedNcciModifier(nonEmptyMods, approvedBypass);
        if (invalid !== null) {
          errors.push({
            rule: 'NCCI-003',
            field: `service_lines.${lineB.lineNumber}.procedure_code`,
            message: `modifier ${invalid} is not valid to override the NCCI edit between ${cptA} and ${cptB}. Please use an approved NCCI modifier.`,
            severity: 'error',
          });
        }
      }
    }
  }

  void ncciBypassModifiersHelpText(bypassModifierCodes);

  return { errors, warnings };
}

function ncciApprovedBypassModifierLookup(codes: readonly string[]): Record<string, true> {
  const lookup: Record<string, true> = {};
  for (const m of codes) {
    const k = String(m).trim().toUpperCase();
    if (k !== '') lookup[k] = true;
  }
  return lookup;
}

function ncciBypassModifiersHelpText(codes: readonly string[]): string {
  const intro = ncciBypassModifiersHelpIntro();
  if (codes.length === 0) return intro;

  return `${intro} The following NCCI-associated modifiers can be used when applicable: ${formatEnglishCommaList([...codes])}.`;
}

function formatEnglishCommaList(items: string[]): string {
  const n = items.length;
  if (n === 1) return items[0];
  if (n === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[n - 1]}`;
}

function nonEmptyLineModifiersUpper(line: NcciServiceLineInput): string[] {
  const out: string[] = [];
  for (const raw of [line.modifier1, line.modifier2, line.modifier3, line.modifier4]) {
    if (raw == null || raw === '') continue;
    const t = String(raw).trim().toUpperCase();
    if (t !== '') out.push(t);
  }
  return out;
}

function serviceLineHasModifierIgnoringCase(line: NcciServiceLineInput, modifier: string): boolean {
  const m = modifier.trim().toUpperCase();
  for (const raw of [line.modifier1, line.modifier2, line.modifier3, line.modifier4]) {
    if (raw == null || raw === '') continue;
    if (String(raw).trim().toUpperCase() === m) return true;
  }
  return false;
}

function firstNonApprovedNcciModifier(
  nonEmptyModsUpper: readonly string[],
  approvedUpper: Readonly<Record<string, true>>,
): string | null {
  for (const mod of nonEmptyModsUpper) {
    if (!approvedUpper[mod]) return mod;
  }
  return null;
}
