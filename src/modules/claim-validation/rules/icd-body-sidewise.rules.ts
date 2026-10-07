import { ClaimIssue } from '../types';

/** Laravel IcdBodySidewiseRules */
export const ICD_BS_001 = 'ICD-BS-001';

const SIDE_LEFT = 'Left';
const SIDE_RIGHT = 'Right';
const SIDE_BILATERAL = 'Bilateral';

const LEFT_MODIFIERS: readonly string[] = [
  'LT', 'FA', 'F1', 'F2', 'F3', 'F4', 'TA', 'T1', 'T2', 'T3', 'T4', 'E1', 'E2',
];

const RIGHT_MODIFIERS: readonly string[] = [
  'RT', 'F5', 'F6', 'F7', 'F8', 'F9', 'T5', 'T6', 'T7', 'T8', 'T9', 'E3', 'E4',
];

const BILATERAL_MODIFIERS: readonly string[] = ['50'];

const BILATERAL_MODIFIER_PAIRS: readonly (readonly [string, string])[] = [
  ['LT', 'RT'],
  ['E1', 'E3'],
  ['E2', 'E4'],
];

export type IcdBodySidewiseServiceLineInput = {
  lineNumber: number;
  procedureCode: string | null;
  modifier1?: string | null;
  modifier2?: string | null;
  modifier3?: string | null;
  modifier4?: string | null;
  diagnosisPointers?: readonly (number | string)[];
};

export type IcdBodySidewiseDiagnosisInput = {
  sequence: number;
  code: string | null;
};

export type IcdBodySidewiseClaimInput = {
  diagnoses: readonly IcdBodySidewiseDiagnosisInput[];
};

/**
 * Laravel IcdBodySidewiseRules::validate
 *
 * @param sidesByNormalizedCode normalized ICD (no dot) -> Left|Right|Bilateral
 */
export function validateIcdBodySidewise(
  lines: readonly IcdBodySidewiseServiceLineInput[],
  claim: IcdBodySidewiseClaimInput,
  sidesByNormalizedCode: Readonly<Record<string, string | undefined>>,
): ClaimIssue[] {
  if (lines.length === 0 || claim.diagnoses.length === 0) {
    return [];
  }

  if (Object.keys(sidesByNormalizedCode).length === 0) {
    return [];
  }

  const exceptedLineNumbers = exceptedLineNumbersForBilateralSplit(lines, claim, sidesByNormalizedCode);
  const errors: ClaimIssue[] = [];

  for (const line of lines) {
    if (exceptedLineNumbers[line.lineNumber]) {
      continue;
    }

    errors.push(...validateIcdBodySidewiseLine(line, claim, sidesByNormalizedCode));
  }

  return errors;
}

function validateIcdBodySidewiseLine(
  line: IcdBodySidewiseServiceLineInput,
  claim: IcdBodySidewiseClaimInput,
  sidesByNormalizedCode: Readonly<Record<string, string | undefined>>,
): ClaimIssue[] {
  const linkedLateralDiagnoses = linkedLateralDiagnosesForLine(line, claim, sidesByNormalizedCode);
  if (linkedLateralDiagnoses.length === 0) {
    return [];
  }

  const lateralModifiers = lateralModifiersOnLine(line);
  if (lateralModifiers.length === 0) {
    return [];
  }

  if (hasBilateralModifierPair(lateralModifiers)) {
    return [];
  }

  if (hasModifier(lateralModifiers, '50')) {
    if (hasSideAmongDiagnoses(linkedLateralDiagnoses, SIDE_BILATERAL)) {
      return [];
    }
    if (
      hasSideAmongDiagnoses(linkedLateralDiagnoses, SIDE_LEFT) &&
      hasSideAmongDiagnoses(linkedLateralDiagnoses, SIDE_RIGHT)
    ) {
      return [];
    }
  }

  const errors: ClaimIssue[] = [];
  const prefix = `service_lines.${line.lineNumber}`;

  for (const diagnosis of linkedLateralDiagnoses) {
    for (const modifier of lateralModifiers) {
      if (modifierMatchesIcdSide(modifier, diagnosis.side)) {
        continue;
      }

      errors.push({
        rule: ICD_BS_001,
        field: `${prefix}.modifiers`,
        message: `Modifier ${modifier} used with CPT ${line.procedureCode} does not follow the laterality of Diagnosis code ${diagnosis.code}. Please append the appropriate modifier.`,
        severity: 'error',
      });
    }
  }

  return errors;
}

function exceptedLineNumbersForBilateralSplit(
  lines: readonly IcdBodySidewiseServiceLineInput[],
  claim: IcdBodySidewiseClaimInput,
  sidesByNormalizedCode: Readonly<Record<string, string | undefined>>,
): Record<number, true> {
  const bilateralCodes = Object.entries(sidesByNormalizedCode)
    .filter(([, side]) => side === SIDE_BILATERAL)
    .map(([code]) => code);

  if (bilateralCodes.length === 0) {
    return {};
  }

  const excepted: Record<number, true> = {};

  for (const bilateralNorm of bilateralCodes) {
    const ltLineNumbers: number[] = [];
    const rtLineNumbers: number[] = [];

    for (const line of lines) {
      if (!lineLinksLateralCode(line, claim, sidesByNormalizedCode, bilateralNorm)) {
        continue;
      }

      const modifiers = lateralModifiersOnLine(line);
      if (hasModifier(modifiers, 'LT')) {
        ltLineNumbers.push(line.lineNumber);
      }
      if (hasModifier(modifiers, 'RT')) {
        rtLineNumbers.push(line.lineNumber);
      }
    }

    if (ltLineNumbers.length === 0 || rtLineNumbers.length === 0) {
      continue;
    }

    for (const lineNumber of [...ltLineNumbers, ...rtLineNumbers]) {
      excepted[lineNumber] = true;
    }
  }

  return excepted;
}

function linkedLateralDiagnosesForLine(
  line: IcdBodySidewiseServiceLineInput,
  claim: IcdBodySidewiseClaimInput,
  sidesByNormalizedCode: Readonly<Record<string, string | undefined>>,
): { code: string; norm: string; side: string }[] {
  const pointers = line.diagnosisPointers ?? [];
  if (pointers.length === 0) {
    return [];
  }

  const linked: { code: string; norm: string; side: string }[] = [];
  const pointerSet = new Set(pointers.map((p) => Number(p)));

  for (const diagnosis of claim.diagnoses) {
    if (!pointerSet.has(diagnosis.sequence)) {
      continue;
    }

    const norm = normalizeIcdCode(String(diagnosis.code ?? ''));
    const side = sidesByNormalizedCode[norm];
    if (!side) {
      continue;
    }

    linked.push({
      code: String(diagnosis.code),
      norm,
      side,
    });
  }

  return linked;
}

function lineLinksLateralCode(
  line: IcdBodySidewiseServiceLineInput,
  claim: IcdBodySidewiseClaimInput,
  sidesByNormalizedCode: Readonly<Record<string, string | undefined>>,
  normalizedCode: string,
): boolean {
  return linkedLateralDiagnosesForLine(line, claim, sidesByNormalizedCode).some(
    (d) => d.norm === normalizedCode,
  );
}

function lateralModifiersOnLine(line: IcdBodySidewiseServiceLineInput): string[] {
  const modifiers: string[] = [];
  const all = allLateralityModifiers();

  for (const raw of [line.modifier1, line.modifier2, line.modifier3, line.modifier4]) {
    if (raw === null || raw === undefined || String(raw).trim() === '') {
      continue;
    }

    let modifier = String(raw).trim().toUpperCase();
    if (modifier === '50') {
      modifier = '50';
    } else if (/^\d+$/.test(modifier)) {
      modifier = modifier.padStart(2, '0');
    }

    if (all[modifier]) {
      modifiers.push(modifier);
    }
  }

  return [...new Set(modifiers)];
}

function hasModifier(modifiers: readonly string[], target: string): boolean {
  return modifiers.includes(target.toUpperCase());
}

function hasBilateralModifierPair(modifiers: readonly string[]): boolean {
  const present: Record<string, true> = {};
  for (const m of modifiers) {
    present[m] = true;
  }

  for (const [left, right] of BILATERAL_MODIFIER_PAIRS) {
    if (present[left] && present[right]) {
      return true;
    }
  }

  return false;
}

function hasSideAmongDiagnoses(diagnoses: readonly { side: string }[], side: string): boolean {
  return diagnoses.some((d) => d.side === side);
}

function modifierMatchesIcdSide(modifier: string, icdSide: string): boolean {
  switch (icdSide) {
    case SIDE_LEFT:
      return LEFT_MODIFIERS.includes(modifier);
    case SIDE_RIGHT:
      return RIGHT_MODIFIERS.includes(modifier);
    case SIDE_BILATERAL:
      return modifier === '50';
    default:
      return false;
  }
}

function allLateralityModifiers(): Record<string, true> {
  const modifiers = [...LEFT_MODIFIERS, ...RIGHT_MODIFIERS, ...BILATERAL_MODIFIERS];
  const out: Record<string, true> = {};
  for (const m of modifiers) {
    out[m] = true;
  }
  return out;
}

function normalizeIcdCode(code: string): string {
  return code.toUpperCase().replace(/\./g, '').trim();
}
