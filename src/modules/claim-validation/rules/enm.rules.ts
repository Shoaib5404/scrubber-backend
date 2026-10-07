import { ClaimIssue } from '../types';

export const EM_001 = 'EM-001';
export const EM_DOS_001 = 'EM-DOS-001';
export const EM_DOS_002 = 'EM-DOS-002';
export const EM_UNIT_001 = 'EM-UNIT-001';
export const EM_DOS_003 = 'EM-DOS-003';
export const EM_MENTAL_001 = 'EM-MENTAL-001';

export const SAME_DOS_MESSAGE =
  'E&M %s and E&M Surgery codes %s cannot be billed together on same DOS.';
export const ONE_DAY_EARLIER_MESSAGE =
  'E&M %s and E&M Surgery codes %s cannot be billed together one day Earlier.';
export const UNITS_MESSAGE = 'Only One E&M procedure code %s Allowed per day.';
export const TWO_EM_SAME_DOS_MESSAGE =
  'Procedure %s and Procedure %s cannot be billed together on one DOS E&M and preventative and well visit cannot be billed together on same DOS.';
export const MENTAL_DISORDER_MESSAGE = 'Mental disorder diagnosis may not be billable with E&Ms.';

const DENIED_MODIFIERS: readonly string[] = [
  '50',
  'LT',
  'RT',
  '51',
  '52',
  '58',
  '59',
  '76',
  '78',
  '79',
  '26',
  'TC',
  'FA',
  'F1',
  'F2',
  'F3',
  'F4',
  'F5',
  'F6',
  'F7',
  'F8',
  'F9',
  'T1',
  'T2',
  'T3',
  'T4',
  'T5',
  'T6',
  'T7',
  'T8',
  'T9',
];

const deniedModifierLookup: Record<string, true> = Object.fromEntries(
  DENIED_MODIFIERS.map((m) => [m.toUpperCase(), true as const]),
) as Record<string, true>;

export type EnmServiceLineInput = {
  lineNumber: number;
  procedureCode: string | null;
  units: number;
  serviceDateFrom: string | Date | null;
  modifier1: string | null;
  modifier2: string | null;
  modifier3: string | null;
  modifier4: string | null;
};

export type EnmDiagnosisInput = {
  sequence: number;
  code: string | null;
};

export type EnmLookupInput = {
  enmProcedures: Readonly<Record<string, true>>;
  enmSurgeryCodes: Readonly<Record<string, true>>;
};

export type EnmValidationOptions = {
  /** Laravel `config('scrubber.rule_switch.enm_one_day_earlier', true)` */
  enmOneDayEarlier?: boolean;
};

export type EnmValidationResult = {
  errors: ClaimIssue[];
  warnings: ClaimIssue[];
};

type DosBucket = {
  procedureOnly: string[];
  surgeryOnly: string[];
  dualCodes: string[];
  dualOccurrences: number;
  firstLineNumber: number;
};

/**
 * Laravel EnmRules — E/M modifiers, units, same-DOS conflicts, mental-disorder warnings.
 */
export function validateEnm(
  lines: EnmServiceLineInput[],
  diagnoses: EnmDiagnosisInput[],
  lookup: EnmLookupInput,
  options: EnmValidationOptions = {},
): EnmValidationResult {
  const errors: ClaimIssue[] = [];
  const warnings: ClaimIssue[] = [];

  if (lines.length === 0) {
    return { errors, warnings };
  }

  const enmOneDayEarlier = options.enmOneDayEarlier ?? true;
  const { enmProcedures: enmCodeSet, enmSurgeryCodes: surgeryCodeSet } = lookup;
  const anyEmLibraryCode =
    Object.keys(enmCodeSet).length > 0 || Object.keys(surgeryCodeSet).length > 0;

  if (Object.keys(enmCodeSet).length > 0) {
    errors.push(...validateDeniedModifiers(lines, enmCodeSet));
    errors.push(...validateEmUnits(lines, enmCodeSet));
    errors.push(...validateTwoEmSameDos(lines, enmCodeSet));
  }

  if (Object.keys(enmCodeSet).length > 0 && Object.keys(surgeryCodeSet).length > 0) {
    errors.push(...validateEmSurgeryDosConflicts(lines, enmCodeSet, surgeryCodeSet, enmOneDayEarlier));
  }

  if (anyEmLibraryCode) {
    warnings.push(...validateMentalDisorderWithEm(diagnoses));
  }

  return { errors, warnings };
}

function validateMentalDisorderWithEm(diagnoses: EnmDiagnosisInput[]): ClaimIssue[] {
  const warnings: ClaimIssue[] = [];

  for (const diagnosis of diagnoses) {
    const code = String(diagnosis.code ?? '')
      .trim()
      .toUpperCase();
    if (code === '' || !code.startsWith('F')) continue;

    const seq = diagnosis.sequence ?? 0;

    warnings.push({
      rule: EM_MENTAL_001,
      field: seq > 0 ? `diagnoses.${seq}.code` : 'diagnoses',
      message: MENTAL_DISORDER_MESSAGE,
      severity: 'warning',
    });
  }

  return warnings;
}

function validateDeniedModifiers(
  lines: EnmServiceLineInput[],
  enmCodeSet: Readonly<Record<string, true>>,
): ClaimIssue[] {
  const errors: ClaimIssue[] = [];

  for (const line of lines) {
    const code = String(line.procedureCode ?? '')
      .trim()
      .toUpperCase();
    if (!enmCodeSet[code]) continue;

    const prefix = `service_lines.${line.lineNumber}`;

    for (const modifier of modifiersOnLineEnm(line)) {
      if (!deniedModifierLookup[modifier]) continue;

      errors.push({
        rule: EM_001,
        field: `${prefix}.modifiers`,
        message: `Line ${line.lineNumber}: Modifier ${modifier} is not required with EM procedure code ${line.procedureCode}.`,
        severity: 'error',
      });
    }
  }

  return errors;
}

function validateEmUnits(
  lines: EnmServiceLineInput[],
  enmCodeSet: Readonly<Record<string, true>>,
): ClaimIssue[] {
  const errors: ClaimIssue[] = [];

  for (const line of lines) {
    const code = String(line.procedureCode ?? '')
      .trim()
      .toUpperCase();
    if (!enmCodeSet[code]) continue;
    if (line.units <= 1) continue;

    errors.push({
      rule: EM_UNIT_001,
      field: `service_lines.${line.lineNumber}.units`,
      message: formatMessage(UNITS_MESSAGE, code),
      severity: 'error',
    });
  }

  return errors;
}

function validateTwoEmSameDos(
  lines: EnmServiceLineInput[],
  enmCodeSet: Readonly<Record<string, true>>,
): ClaimIssue[] {
  const codesByDos: Record<string, string[]> = {};
  const firstLineByDos: Record<string, EnmServiceLineInput> = {};

  for (const line of lines) {
    const code = String(line.procedureCode ?? '')
      .trim()
      .toUpperCase();
    if (!enmCodeSet[code]) continue;

    const dos = dosKeyEnm(line.serviceDateFrom);
    if (dos === null) continue;

    if (!codesByDos[dos]) {
      codesByDos[dos] = [];
      firstLineByDos[dos] = line;
    }

    if (!codesByDos[dos].includes(code)) {
      codesByDos[dos].push(code);
    }
  }

  const errors: ClaimIssue[] = [];
  for (const dos of Object.keys(codesByDos)) {
    const codes = codesByDos[dos];
    if (codes.length < 2) continue;

    const first = codes[0];
    const second = codes.slice(1).join(', ');
    const line = firstLineByDos[dos];

    errors.push({
      rule: EM_DOS_003,
      field: `service_lines.${line.lineNumber}.procedure_code`,
      message: formatMessage(TWO_EM_SAME_DOS_MESSAGE, first, second),
      severity: 'error',
    });
  }

  return errors;
}

function validateEmSurgeryDosConflicts(
  lines: EnmServiceLineInput[],
  enmCodeSet: Readonly<Record<string, true>>,
  surgeryCodeSet: Readonly<Record<string, true>>,
  enmOneDayEarlier: boolean,
): ClaimIssue[] {
  const byDos: Record<string, DosBucket> = {};

  for (const line of lines) {
    const code = String(line.procedureCode ?? '')
      .trim()
      .toUpperCase();
    const dos = dosKeyEnm(line.serviceDateFrom);
    if (dos === null || code === '') continue;

    const inEm = Boolean(enmCodeSet[code]);
    const inSurgery = Boolean(surgeryCodeSet[code]);
    if (!inEm && !inSurgery) continue;

    if (!byDos[dos]) {
      byDos[dos] = {
        procedureOnly: [],
        surgeryOnly: [],
        dualCodes: [],
        dualOccurrences: 0,
        firstLineNumber: line.lineNumber,
      };
    }

    if (inEm && inSurgery) {
      byDos[dos].dualOccurrences += 1;
      if (!byDos[dos].dualCodes.includes(code)) {
        byDos[dos].dualCodes.push(code);
      }
      continue;
    }

    if (inEm && !byDos[dos].procedureOnly.includes(code)) {
      byDos[dos].procedureOnly.push(code);
    }

    if (inSurgery && !byDos[dos].surgeryOnly.includes(code)) {
      byDos[dos].surgeryOnly.push(code);
    }
  }

  const errors: ClaimIssue[] = [];

  for (const dos of Object.keys(byDos)) {
    const bucket = byDos[dos];
    if (!hasSameDosEmSurgeryConflict(bucket)) continue;

    const [emCodes, surgeryCodes] = sameDosConflictMessageLists(bucket);
    if (emCodes.length === 0 || surgeryCodes.length === 0) continue;

    errors.push({
      rule: EM_DOS_001,
      field: `service_lines.${bucket.firstLineNumber}.procedure_code`,
      message: formatMessage(SAME_DOS_MESSAGE, emCodes.join(', '), surgeryCodes.join(', ')),
      severity: 'error',
    });
  }

  if (enmOneDayEarlier) {
    errors.push(...validateEmSurgeryOneDayEarlierConflicts(byDos));
  }

  return errors;
}

function hasSameDosEmSurgeryConflict(bucket: DosBucket): boolean {
  const hasProcedureOnly = bucket.procedureOnly.length > 0;
  const hasSurgeryOnly = bucket.surgeryOnly.length > 0;
  const dualOccurrences = bucket.dualOccurrences;

  if (hasProcedureOnly && hasSurgeryOnly) {
    return true;
  }

  if (dualOccurrences >= 1 && (hasProcedureOnly || hasSurgeryOnly)) {
    return true;
  }

  return dualOccurrences >= 2;
}

function sameDosConflictMessageLists(bucket: DosBucket): [string[], string[]] {
  const { procedureOnly, surgeryOnly, dualCodes } = bucket;

  if (procedureOnly.length === 0 && surgeryOnly.length === 0) {
    return [dualCodes, dualCodes];
  }

  if (procedureOnly.length > 0 && surgeryOnly.length === 0) {
    return [procedureOnly, dualCodes];
  }

  if (surgeryOnly.length > 0 && procedureOnly.length === 0) {
    return [dualCodes, surgeryOnly];
  }

  return [
    [...new Set([...procedureOnly, ...dualCodes])],
    [...new Set([...surgeryOnly, ...dualCodes])],
  ];
}

function validateEmSurgeryOneDayEarlierConflicts(byDos: Record<string, DosBucket>): ClaimIssue[] {
  const errors: ClaimIssue[] = [];

  for (const dos of Object.keys(byDos)) {
    const bucket = byDos[dos];
    const emCodes = [...new Set([...bucket.procedureOnly, ...bucket.dualCodes])];
    if (emCodes.length === 0) continue;

    const nextDay = addDaysYmd(dos, 1);
    const next = byDos[nextDay];
    if (!next) continue;

    const surgeryCodes = [...new Set([...next.surgeryOnly, ...next.dualCodes])];
    if (surgeryCodes.length === 0) continue;

    errors.push({
      rule: EM_DOS_002,
      field: `service_lines.${bucket.firstLineNumber}.procedure_code`,
      message: formatMessage(ONE_DAY_EARLIER_MESSAGE, emCodes.join(', '), surgeryCodes.join(', ')),
      severity: 'error',
    });
  }

  return errors;
}

function modifiersOnLineEnm(line: EnmServiceLineInput): string[] {
  return [line.modifier1, line.modifier2, line.modifier3, line.modifier4]
    .map((raw) => normalizeModifierEnm(raw))
    .filter((m) => m !== '');
}

function normalizeModifierEnm(modifier: string | null | undefined): string {
  const m = String(modifier ?? '')
    .trim()
    .toUpperCase();
  if (m === '') return '';
  return m.padStart(2, '0');
}

function dosKeyEnm(from: string | Date | null | undefined): string | null {
  if (from == null) return null;

  if (from instanceof Date) {
    return formatYmdUtc(from);
  }

  const s = String(from).trim();
  if (s === '') return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  const parsed = new Date(s);
  if (Number.isNaN(parsed.getTime())) return null;
  return formatYmdUtc(parsed);
}

function formatYmdUtc(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDaysYmd(ymd: string, days: number): string {
  const [y, mo, d] = ymd.split('-').map(Number);
  const date = new Date(Date.UTC(y, mo - 1, d + days));
  return formatYmdUtc(date);
}

function formatMessage(template: string, ...args: string[]): string {
  let i = 0;
  return template.replace(/%s/g, () => args[i++] ?? '');
}
