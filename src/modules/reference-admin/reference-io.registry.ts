/**
 * Laravel web import/export surface (routes/web.php) — not every reference domain.
 * Import: age-specific-cpt-rules only.
 * Export JSON: age-specific-cpt-rules, cpt-codes, ncci, cpt-pos-rules,
 * cpt-modifier-rules, gender-specific-cpt-rules.
 */

export const REFERENCE_WEB_IMPORT_SLUGS = new Set<string>(['age-specific-cpt-rules']);

export const REFERENCE_WEB_EXPORT_SLUGS = new Set<string>([
  'age-specific-cpt-rules',
  'cpt-codes',
  'ncci',
  'cpt-pos-rules',
  'cpt-modifier-rules',
  'gender-specific-cpt-rules',
]);

export function referenceDomainSupportsWebImport(slug: string): boolean {
  return REFERENCE_WEB_IMPORT_SLUGS.has(slug);
}

export function referenceDomainSupportsWebExport(slug: string): boolean {
  return REFERENCE_WEB_EXPORT_SLUGS.has(slug);
}
