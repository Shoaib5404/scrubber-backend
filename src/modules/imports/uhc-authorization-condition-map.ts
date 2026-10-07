/** Laravel UhcAuthorizationConditionMap */
export const UHC_AUTH_CONDITION_ALWAYS = 'always';
export const UHC_AUTH_CONDITION_CHARGE_GT = 'charge_gt';
export const UHC_AUTH_CONDITION_POS_IN = 'pos_in';
export const UHC_AUTH_CONDITION_MANDATORY_WITH_ICDS = 'mandatory_with_icds';
export const UHC_AUTH_CONDITION_NOT_REQUIRED_WITH_ICDS = 'not_required_with_icds';

const DESCRIPTION_TO_SLUG: Record<string, string> = {
  '': UHC_AUTH_CONDITION_ALWAYS,
  'CPT Charged Amount > 1000': UHC_AUTH_CONDITION_CHARGE_GT,
  'POS ONLY 11,12,13,22,31,32,65.': UHC_AUTH_CONDITION_POS_IN,
  'POS ONLY 12,13,22,31,32,65.': UHC_AUTH_CONDITION_POS_IN,
  'POS 22': UHC_AUTH_CONDITION_POS_IN,
  'POS 19, 22': UHC_AUTH_CONDITION_POS_IN,
  'POS 19 & 22': UHC_AUTH_CONDITION_POS_IN,
  'POS 12': UHC_AUTH_CONDITION_POS_IN,
  'POS 21,51,61.': UHC_AUTH_CONDITION_POS_IN,
  'Mandatory with ICDs': UHC_AUTH_CONDITION_MANDATORY_WITH_ICDS,
  'NOT Required with these ICDs': UHC_AUTH_CONDITION_NOT_REQUIRED_WITH_ICDS,
};

export function slugForUhcAuthorizationDescription(description: string): string | null {
  if (Object.prototype.hasOwnProperty.call(DESCRIPTION_TO_SLUG, description)) {
    return DESCRIPTION_TO_SLUG[description] ?? null;
  }
  return null;
}

export function isUhcAuthorizationIcdCondition(slug: string): boolean {
  return (
    slug === UHC_AUTH_CONDITION_MANDATORY_WITH_ICDS ||
    slug === UHC_AUTH_CONDITION_NOT_REQUIRED_WITH_ICDS
  );
}
