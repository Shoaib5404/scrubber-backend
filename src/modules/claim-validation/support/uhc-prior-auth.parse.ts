import type { UhcAuthorizationParsedRule } from '../rules/cpt.rules';

/** Laravel UhcAuthorizationConditionValuesNormalizer::parsePosList */
export function parseUhcPosList(conditionValues: string | null | undefined): string[] {
  if (conditionValues === null || conditionValues === undefined || conditionValues.trim() === '') {
    return [];
  }
  const codes: string[] = [];
  for (const part of conditionValues.split(',')) {
    const trimmed = part.trim();
    if (trimmed === '') continue;
    codes.push(trimmed.padStart(2, '0'));
  }
  return [...new Set(codes)];
}

/** Laravel UhcAuthorizationConditionValuesNormalizer::parseIcdLookup */
export function parseUhcIcdLookup(
  conditionValues: string | null | undefined,
): Record<string, true> {
  if (conditionValues === null || conditionValues === undefined || conditionValues.trim() === '') {
    return {};
  }
  const lookup: Record<string, true> = {};
  for (const part of conditionValues.split(',')) {
    const normalized = part.trim().toUpperCase().replace(/\./g, '');
    if (normalized !== '') {
      lookup[normalized] = true;
    }
  }
  return lookup;
}

/**
 * Laravel Uhc87726PriorAuthRules::buildParsedValuesByRuleId — map a DB row into the
 * shape expected by validateUhcPriorAuthRules.
 */
export function toUhcAuthorizationParsedRule(row: {
  id: number;
  condition: string;
  conditionValues: string | null;
}): UhcAuthorizationParsedRule {
  const values = row.conditionValues;
  const charge =
    values !== null && values !== undefined && values.trim() !== '' && !Number.isNaN(Number(values))
      ? Number(values)
      : null;
  return {
    id: row.id,
    condition: row.condition,
    parsed: {
      pos: parseUhcPosList(values),
      icd: parseUhcIcdLookup(values),
      charge,
    },
  };
}
