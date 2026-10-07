import { ClaimIssue } from '../types';

/** Laravel GlobalSurgicalModifierRules::MISSING_78_79_RULE_CODE */
export const SURG_MOD_001 = 'SURG-MOD-001';

/** Laravel GlobalSurgicalModifierRules::MISSING_24_RULE_CODE */
export const SURG_MOD_002 = 'SURG-MOD-002';

/** Laravel GlobalSurgicalModifierRules::MISSING_57_RULE_CODE */
export const SURG_MOD_003 = 'SURG-MOD-003';

export const SURGICAL_PROCEDURE_MESSAGE =
  'Major surgery code (%s) identified according to global days policy. You must append modifier 78, 79 with surgical procedure (%s).';

export const ENM_SURGERY_MESSAGE =
  'Major surgery code (%s) identified according to global days policy. You must append 24 modifier with E & M (%s).';

export const ENM_MODIFIER_57_MESSAGE =
  'Major surgery code (%s) identified on the day E&M. You must append modifier 57 with E&M (%s).';

export type GlobalSurgicalServiceLineInput = {
  lineNumber: number;
  procedureCode: string | null;
  modifier1: string | null;
  modifier2: string | null;
  modifier3: string | null;
  modifier4: string | null;
};

export type GlobalSurgicalLookupInput = {
  majorSurgeryCodes: Readonly<Record<string, true>>;
  enmSurgeryCodes: Readonly<Record<string, true>>;
  enmProcedures: Readonly<Record<string, true>>;
  globalDaysSurgeries: Readonly<Record<string, true>>;
};

/**
 * Laravel GlobalSurgicalModifierRules — global/major surgery modifier requirements.
 */
export function validateGlobalSurgicalModifier(
  lines: GlobalSurgicalServiceLineInput[],
  lookup: GlobalSurgicalLookupInput,
): ClaimIssue[] {
  const errors: ClaimIssue[] = [];
  if (lines.length === 0) return errors;

  const { majorSurgeryCodes, enmSurgeryCodes, enmProcedures, globalDaysSurgeries } = lookup;

  for (const line of lines) {
    const code = String(line.procedureCode ?? '')
      .trim()
      .toUpperCase();
    if (code === '') continue;

    const modifiers = modifiersOnLineGlobalSurgical(line);
    const has7879 = modifiers.includes('78') || modifiers.includes('79');
    const has24 = modifiers.includes('24');
    const has57 = modifiers.includes('57');
    const lineNumber = line.lineNumber;
    const fieldPrefix = lineNumber > 0 ? `service_lines.${lineNumber}` : 'service_lines';

    const inMajor = Boolean(majorSurgeryCodes[code]);
    const inEnmSurgery = Boolean(enmSurgeryCodes[code]);
    const inEnmProcedure = Boolean(enmProcedures[code]);

    if (inMajor && inEnmSurgery && inEnmProcedure && !has57) {
      errors.push({
        rule: SURG_MOD_003,
        field: `${fieldPrefix}.modifier_1`,
        message: sprintfEnm57(code),
        severity: 'error',
      });
    }

    if (inMajor && inEnmSurgery) {
      if (!has7879) {
        errors.push({
          rule: SURG_MOD_001,
          field: `${fieldPrefix}.modifier_1`,
          message: sprintfSurgical(code),
          severity: 'error',
        });
      }

      if (!has24) {
        errors.push({
          rule: SURG_MOD_002,
          field: `${fieldPrefix}.modifier_1`,
          message: sprintfEnm24(code),
          severity: 'error',
        });
      }

      continue;
    }

    if (inMajor) {
      if (!has7879) {
        errors.push({
          rule: SURG_MOD_001,
          field: `${fieldPrefix}.modifier_1`,
          message: sprintfSurgical(code),
          severity: 'error',
        });
      }

      continue;
    }

    if (globalDaysSurgeries[code] && !has7879) {
      errors.push({
        rule: SURG_MOD_001,
        field: `${fieldPrefix}.modifier_1`,
        message: sprintfSurgical(code),
        severity: 'error',
      });
    }
  }

  return errors;
}

function sprintfSurgical(code: string): string {
  return SURGICAL_PROCEDURE_MESSAGE.replace('%s', code).replace('%s', code);
}

function sprintfEnm24(code: string): string {
  return ENM_SURGERY_MESSAGE.replace('%s', code).replace('%s', code);
}

function sprintfEnm57(code: string): string {
  return ENM_MODIFIER_57_MESSAGE.replace('%s', code).replace('%s', code);
}

function modifiersOnLineGlobalSurgical(line: GlobalSurgicalServiceLineInput): string[] {
  return [line.modifier1, line.modifier2, line.modifier3, line.modifier4]
    .map((raw) => normalizeModifierGlobal(raw))
    .filter((m) => m !== '');
}

function normalizeModifierGlobal(modifier: string | null | undefined): string {
  const m = String(modifier ?? '')
    .trim()
    .toUpperCase();
  if (m === '') return '';
  return m.padStart(2, '0');
}
