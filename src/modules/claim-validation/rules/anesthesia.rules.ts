import { ClaimIssue } from '../types';

export type AnesthesiaServiceLineInput = {
  lineNumber: number;
  procedureCode: string | null;
  units: number;
  unitScale: string | null;
  modifier1: string | null;
  modifier2: string | null;
  modifier3: string | null;
  modifier4: string | null;
};

export type AnesthesiaLookupInput = {
  /** Laravel `anesthesia_codes`: normalized CPT -> minimum units (`unit` column). */
  minUnitsByCode: Readonly<Record<string, number>>;
  /** Laravel `anesthesia_codes_with_billable_modifiers`: keys `CODE|MODIFIER` (normalized). */
  allowedModifierKeys: Readonly<Record<string, true>>;
  /** CPT codes that have at least one billable-modifier rule row. */
  codesWithBillableModifierRules: Readonly<Record<string, true>>;
};

/**
 * Laravel AnesthesiaRules — anesthesia CPT unit scale/units and billable modifier checks.
 */
export function validateAnesthesia(
  lines: AnesthesiaServiceLineInput[],
  lookup: AnesthesiaLookupInput,
): ClaimIssue[] {
  const errors: ClaimIssue[] = [];
  if (lines.length === 0) return errors;

  const { minUnitsByCode, allowedModifierKeys, codesWithBillableModifierRules } = lookup;

  for (const line of lines) {
    const code = String(line.procedureCode ?? '')
      .trim()
      .toUpperCase();
    const prefix = `service_lines.${line.lineNumber}`;

    if (code in minUnitsByCode) {
      const requiredMin = minUnitsByCode[code];
      const lineScale = String(line.unitScale ?? 'UN')
        .trim()
        .toUpperCase();

      if (lineScale !== 'MJ') {
        errors.push({
          rule: 'ANE-001',
          field: `${prefix}.unit_scale`,
          message: `Line ${line.lineNumber}: Anesthesia procedure codes must use unit scale MJ (minutes).`,
          severity: 'error',
        });
      }

      const lineUnits = line.units;
      if (lineUnits <= requiredMin) {
        errors.push({
          rule: 'ANE-002',
          field: `${prefix}.units`,
          message: `Line ${line.lineNumber}: Service units must be greater than ${requiredMin} for anesthesia CPT ${line.procedureCode}.`,
          severity: 'error',
        });
      }
    }

    errors.push(
      ...billableModifierViolations(
        line,
        code,
        allowedModifierKeys,
        codesWithBillableModifierRules,
        prefix,
      ),
    );
  }

  return errors;
}

function billableModifierViolations(
  line: AnesthesiaServiceLineInput,
  normalizedCode: string,
  allowedModifierKeys: Readonly<Record<string, true>>,
  codesWithBillableModifierRules: Readonly<Record<string, true>>,
  prefix: string,
): ClaimIssue[] {
  const modifiersOnLine = modifiersOnLineAnesthesia(line);

  if (!codesWithBillableModifierRules[normalizedCode]) {
    return [];
  }

  if (modifiersOnLine.length === 0) {
    return [
      {
        rule: 'ANE-004',
        field: `${prefix}.modifiers`,
        message: `Line ${line.lineNumber}: CPT ${line.procedureCode} must include at least one anesthesia billable modifier.`,
        severity: 'error',
      },
    ];
  }

  const violations: ClaimIssue[] = [];
  for (const modifier of modifiersOnLine) {
    const pairKey = `${normalizedCode}|${modifier}`;
    if (!allowedModifierKeys[pairKey]) {
      violations.push({
        rule: 'ANE-003',
        field: `${prefix}.modifiers`,
        message: `Line ${line.lineNumber}: Modifier ${modifier} is not allowed for anesthesia billable procedure ${line.procedureCode}.`,
        severity: 'error',
      });
    }
  }

  return violations;
}

function modifiersOnLineAnesthesia(line: AnesthesiaServiceLineInput): string[] {
  return [line.modifier1, line.modifier2, line.modifier3, line.modifier4]
    .map((raw) => normalizeModifier(raw))
    .filter((m) => m !== '');
}

function normalizeModifier(modifier: string | null | undefined): string {
  const m = String(modifier ?? '')
    .trim()
    .toUpperCase();
  if (m === '') return '';
  return m.padStart(2, '0');
}
