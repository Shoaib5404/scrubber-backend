import { ClaimIssue } from '../types';
import { isApplicableMueUhcOxford, MueUhcOxfordClaimInput } from './mue-uhc-oxford.rules';

export const MUE_001 = 'MUE-001';
export const MUE_002 = 'MUE-002';
export const MUE_003 = 'MUE-003';

export const MAI_1_LINE_REJECTION_MESSAGE =
  'Units of service for procedure code %s (%s) exceed the MUE limit of %s for date of service %s. Correct units on this service line.';

export const MAI_1_MODIFIER_REJECTION_MESSAGE =
  'Units of service for procedure code %s (%s) exceed the MUE limit of %s for date of service %s. Add a valid bypass modifier on at least one line, or correct units.';

export const MAI_2_REJECTION_MESSAGE =
  'Units of service for procedure code %s (%s) exceed the MUE limit of %s for date of service %s. This limit cannot be bypassed with modifiers.';

export const MAI_3_WARNING_MESSAGE =
  'Units of service for procedure code %s (%s) exceed the MUE limit of %s for date of service %s. May be allowable with supporting clinical documentation — please check the CPT or units.';

/** Laravel config/common.php `mue_bypass_modifiers` */
export const MUE_BYPASS_MODIFIERS: readonly string[] = [
  '59',
  'XS',
  'XU',
  'E1',
  'E2',
  'E3',
  'E4',
  'FA',
  'F1',
  'F2',
  'F4',
  'F5',
  'F6',
  'F7',
  'F8',
  'F9',
  'LC',
  'LD',
  'LM',
  'LT',
  'RC',
  'RI',
  'RT',
  'TA',
  'T1',
  'T2',
  'T3',
  'T4',
  'T5',
  'T6',
  'T7',
  'T8',
  'T9',
  '24',
  '25',
  '57',
  '58',
  'FT',
];

export type MuePractitionerServiceLineInput = {
  lineNumber: number;
  procedureCode: string | null;
  units: number;
  serviceDateFrom: string | Date | null;
  modifier1: string | null;
  modifier2: string | null;
  modifier3: string | null;
  modifier4: string | null;
};

export type MuePractitionerClaimInput = MueUhcOxfordClaimInput;

export type MuePractitionerLookupRow = {
  upperLimit: string | number | null;
  indicator: string | number | null;
};

export type MuePractitionerValidationResult = {
  errors: ClaimIssue[];
  warnings: ClaimIssue[];
};

/** Laravel MuePractitionerRules::isApplicable */
export function isApplicableMuePractitioner(claim: MuePractitionerClaimInput): boolean {
  return !isApplicableMueUhcOxford(claim);
}

/**
 * Laravel MuePractitionerRules::validateUnits — CMS MUE practitioner services by MAI.
 */
export function validateMuePractitioner(
  lines: MuePractitionerServiceLineInput[],
  claim: MuePractitionerClaimInput,
  mueRowsByCode: Readonly<Record<string, MuePractitionerLookupRow>>,
  bypassModifierCodes: readonly string[] = MUE_BYPASS_MODIFIERS,
): MuePractitionerValidationResult {
  const errors: ClaimIssue[] = [];
  const warnings: ClaimIssue[] = [];

  if (!isApplicableMuePractitioner(claim) || lines.length === 0) {
    return { errors, warnings };
  }

  const bypassLookup = bypassModifierLookup(bypassModifierCodes);

  type MaiGroup = {
    mue: MuePractitionerLookupRow;
    lines: MuePractitionerServiceLineInput[];
    sum: number;
  };

  const mai1Groups: Record<string, MaiGroup> = {};
  const mai2Groups: Record<string, MaiGroup> = {};
  const mai3Groups: Record<string, MaiGroup> = {};

  for (const line of lines) {
    const code = String(line.procedureCode ?? '').trim();
    const normalized = code.toUpperCase();
    const mueRow = mueRowsByCode[normalized];
    if (!mueRow) continue;

    const maxUnits = parseMaxUnits(mueRow.upperLimit);
    if (maxUnits === null) continue;

    const mai = parseMai(mueRow.indicator);
    if (mai === null) continue;

    const units = line.units;
    const dos = dosKeyMue(line.serviceDateFrom);

    if (dos === null) {
      if (mai === 1 && units > maxUnits) {
        errors.push(buildMai1LineError(line, code, units, maxUnits, 'N/A'));
      }
      continue;
    }

    const groupKey = `${normalized}|${dos}`;
    const target =
      mai === 1 ? mai1Groups : mai === 2 ? mai2Groups : mai3Groups;

    if (!target[groupKey]) {
      target[groupKey] = { mue: mueRow, lines: [], sum: 0 };
    }
    target[groupKey].lines.push(line);
    target[groupKey].sum += units;
  }

  for (const groupKey of Object.keys(mai1Groups)) {
    const group = mai1Groups[groupKey];
    const maxUnits = parseMaxUnits(group.mue.upperLimit);
    if (maxUnits === null) continue;

    const dos = groupKey.split('|')[1] ?? '';
    let hasLineOverLimit = false;

    for (const line of group.lines) {
      if (line.units <= maxUnits) continue;

      hasLineOverLimit = true;
      const code = String(line.procedureCode ?? '').trim();
      errors.push(buildMai1LineError(line, code, line.units, maxUnits, dos));
    }

    if (hasLineOverLimit || group.sum <= maxUnits) continue;

    let hasBypassModifier = false;
    for (const line of group.lines) {
      if (lineHasBypassModifier(line, bypassLookup)) {
        hasBypassModifier = true;
        break;
      }
    }

    if (hasBypassModifier) continue;

    const firstLine = group.lines[0];
    const code = String(firstLine.procedureCode ?? '').trim();
    errors.push({
      rule: MUE_001,
      field: `service_lines.${firstLine.lineNumber}.units`,
      message: formatMueMessage(
        MAI_1_MODIFIER_REJECTION_MESSAGE,
        code,
        group.sum,
        maxUnits,
        dos,
      ),
      severity: 'error',
    });
  }

  for (const groupKey of Object.keys(mai2Groups)) {
    const group = mai2Groups[groupKey];
    const maxUnits = parseMaxUnits(group.mue.upperLimit);
    if (maxUnits === null || group.sum <= maxUnits) continue;

    const firstLine = group.lines[0];
    const code = String(firstLine.procedureCode ?? '').trim();
    const dos = groupKey.split('|')[1] ?? '';

    errors.push({
      rule: MUE_002,
      field: `service_lines.${firstLine.lineNumber}.units`,
      message: formatMueMessage(MAI_2_REJECTION_MESSAGE, code, group.sum, maxUnits, dos),
      severity: 'error',
    });
  }

  for (const groupKey of Object.keys(mai3Groups)) {
    const group = mai3Groups[groupKey];
    const maxUnits = parseMaxUnits(group.mue.upperLimit);
    if (maxUnits === null || group.sum <= maxUnits) continue;

    const firstLine = group.lines[0];
    const code = String(firstLine.procedureCode ?? '').trim();
    const dos = groupKey.split('|')[1] ?? '';

    warnings.push({
      rule: MUE_003,
      field: `service_lines.${firstLine.lineNumber}.units`,
      message: formatMueMessage(MAI_3_WARNING_MESSAGE, code, group.sum, maxUnits, dos),
      severity: 'warning',
    });
  }

  return { errors, warnings };
}

function buildMai1LineError(
  line: MuePractitionerServiceLineInput,
  code: string,
  units: number,
  maxUnits: number,
  dos: string,
): ClaimIssue {
  return {
    rule: MUE_001,
    field: `service_lines.${line.lineNumber}.units`,
    message: formatMueMessage(MAI_1_LINE_REJECTION_MESSAGE, code, units, maxUnits, dos),
    severity: 'error',
  };
}

function bypassModifierLookup(codes: readonly string[]): Record<string, true> {
  const lookup: Record<string, true> = {};
  for (const modifier of codes) {
    const key = String(modifier).trim().toUpperCase();
    if (key !== '') lookup[key] = true;
  }
  return lookup;
}

function lineHasBypassModifier(
  line: MuePractitionerServiceLineInput,
  bypassLookup: Readonly<Record<string, true>>,
): boolean {
  for (const raw of [line.modifier1, line.modifier2, line.modifier3, line.modifier4]) {
    if (raw == null || raw === '') continue;
    const mod = String(raw).trim().toUpperCase();
    if (mod !== '' && bypassLookup[mod]) return true;
  }
  return false;
}

function parseMai(indicator: string | number | null): 1 | 2 | 3 | null {
  if (indicator === null) return null;
  const trimmed = String(indicator).trim();
  if (trimmed === '' || !/^-?\d+(\.\d+)?$/.test(trimmed)) return null;
  const mai = Number.parseInt(trimmed, 10);
  if (mai === 1 || mai === 2 || mai === 3) return mai;
  return null;
}

function dosKeyMue(from: string | Date | null | undefined): string | null {
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

function parseMaxUnits(mueValue: string | number | null): number | null {
  if (mueValue === null) return null;
  const trimmed = String(mueValue).trim();
  if (trimmed === '' || !/^-?\d+(\.\d+)?$/.test(trimmed)) return null;
  return Number.parseFloat(trimmed);
}

function formatUnitsForMessage(units: number): string {
  if (!Number.isFinite(units)) return String(units);
  let formatted = units.toFixed(2);
  formatted = formatted.replace(/0+$/, '').replace(/\.$/, '');
  return formatted === '' ? '0' : formatted;
}

function formatMueMessage(
  template: string,
  code: string,
  units: number,
  maxUnits: number,
  dos: string,
): string {
  return template
    .replace('%s', code)
    .replace('%s', formatUnitsForMessage(units))
    .replace('%s', formatUnitsForMessage(maxUnits))
    .replace('%s', dos !== '' ? dos : 'N/A');
}
