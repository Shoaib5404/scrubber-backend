import { ClaimIssue } from '../types';

/** Laravel ModifierSequenceRules::APPLICABLE_FILING_INDICATORS */
export const MODIFIER_SEQUENCE_FILING_INDICATORS: readonly string[] = ['MA', 'MB', '16', 'BL'];

/** Laravel ModifierSequenceRules::RULE_CODE */
export const MOD_SEQ_001 = 'MOD-SEQ-001';

export type ModifierSequenceServiceLineInput = {
  lineNumber: number;
  procedureCode: string | null;
  modifier1: string | null;
  modifier2: string | null;
  modifier3: string | null;
  modifier4: string | null;
};

export type ModifierSequenceClaimInput = {
  claimFilingIndicator: string | null;
};

/**
 * Active `modifier_sequences` row shape. Laravel orders rows by `id` ascending and
 * explicitly ignores `sequence_order` when building the reference order.
 */
export type ModifierSequenceLookupRow = {
  id: number;
  modifier: string;
};

/** Laravel ModifierSequenceRules::isApplicable */
export function isApplicableModifierSequence(claim: ModifierSequenceClaimInput): boolean {
  const indicator = String(claim.claimFilingIndicator ?? '')
    .trim()
    .toUpperCase();
  return MODIFIER_SEQUENCE_FILING_INDICATORS.includes(indicator);
}

/**
 * Laravel ModifierSequenceRules — modifier order on service lines must follow the
 * `modifier_sequences` table order for MA, MB, 16, and BL claims. Modifiers not present
 * in the reference table are unconstrained and may appear in any slot.
 *
 * @param modifierSequenceRows All active rows of the `modifier_sequences` lookup table
 *   (Laravel: `LookupCacheService::all('modifier_sequences')`). Order of the array does
 *   not matter; rows are re-sorted by `id` internally.
 */
export function validateModifierSequence(
  lines: ModifierSequenceServiceLineInput[],
  claim: ModifierSequenceClaimInput,
  modifierSequenceRows: readonly ModifierSequenceLookupRow[],
): ClaimIssue[] {
  if (!isApplicableModifierSequence(claim) || lines.length === 0) return [];

  const tableOrder = loadTableModifierOrder(modifierSequenceRows);
  if (tableOrder.length === 0) return [];

  const knownSet = new Set(tableOrder);
  const errors: ClaimIssue[] = [];

  for (const line of lines) {
    const cptCode = String(line.procedureCode ?? '').trim();
    if (cptCode === '') continue;

    const actual = modifiersOnLine(line);
    if (actual.length === 0) continue;

    const knownInClaim = knownModifiersInClaimOrder(actual, knownSet);
    if (knownInClaim.length === 0) continue;

    const expected = expectedKnownOrder(knownInClaim, tableOrder);
    if (arraysEqual(knownInClaim, expected)) continue;

    const suggested = buildSuggestedSequence(actual, tableOrder, knownSet);

    errors.push({
      rule: MOD_SEQ_001,
      field: `service_lines.${line.lineNumber}.modifiers`,
      message: `Modifier sequence against CPT ${cptCode} is invalid for most payers. Suggested modifier sequence is (${suggested.join(', ')})`,
      severity: 'error',
    });
  }

  return errors;
}

function loadTableModifierOrder(rows: readonly ModifierSequenceLookupRow[]): string[] {
  const sorted = [...rows].sort((a, b) => (a.id ?? 0) - (b.id ?? 0));
  const order: string[] = [];
  for (const row of sorted) {
    const modifier = normalizeModifier(row.modifier);
    if (modifier !== '') order.push(modifier);
  }
  return order;
}

function knownModifiersInClaimOrder(actual: readonly string[], knownSet: ReadonlySet<string>): string[] {
  return actual.filter((modifier) => knownSet.has(modifier));
}

function expectedKnownOrder(knownInClaim: readonly string[], tableOrder: readonly string[]): string[] {
  const knownLookup = new Set(knownInClaim);
  return tableOrder.filter((modifier) => knownLookup.has(modifier));
}

function buildSuggestedSequence(
  actual: readonly string[],
  tableOrder: readonly string[],
  knownSet: ReadonlySet<string>,
): string[] {
  const knownInClaim = knownModifiersInClaimOrder(actual, knownSet);
  const correctKnownOrder = expectedKnownOrder(knownInClaim, tableOrder);
  const unknown = actual.filter((modifier) => !knownSet.has(modifier));
  return [...correctKnownOrder, ...unknown];
}

function modifiersOnLine(line: ModifierSequenceServiceLineInput): string[] {
  return [line.modifier1, line.modifier2, line.modifier3, line.modifier4]
    .map((modifier) => normalizeModifier(modifier))
    .filter((modifier) => modifier !== '');
}

function normalizeModifier(modifier: string | null | undefined): string {
  const m = String(modifier ?? '')
    .trim()
    .toUpperCase();
  if (m === '') return '';
  return m.padStart(2, '0');
}

function arraysEqual(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}
