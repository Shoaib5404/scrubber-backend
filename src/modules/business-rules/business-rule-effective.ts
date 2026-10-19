/** Personal switch wins, then the platform row, then the seeded default (on). */
export function effectiveEnabled(
  defaultEnabled: boolean,
  platform: boolean | undefined,
  personal: boolean | undefined,
): boolean {
  if (personal !== undefined) return personal;
  if (platform !== undefined) return platform;
  return defaultEnabled;
}

export const BUSINESS_RULE_SCOPE = {
  Global: 'global',
  User: 'user',
} as const;

export type BusinessRuleScope =
  (typeof BUSINESS_RULE_SCOPE)[keyof typeof BUSINESS_RULE_SCOPE];

/** Platform rows use scope_id 0 so the unique key stays defined. */
export const GLOBAL_SCOPE_ID = 0;
