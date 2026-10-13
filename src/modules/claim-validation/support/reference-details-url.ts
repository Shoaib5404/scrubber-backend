/**
 * Build SPA deep-links for LCD / crosswalk reference tables (Laravel `route(...index)`).
 * Relative paths resolve against the staff frontend origin when opened from claim detail.
 */

export type ReferenceDomainSlug =
  | 'aetna-fetal-lcd'
  | 'aetna-b12-lcd'
  | 'cigna-cpt-icd-crosswalk'
  | 'ncd-icd';

export function referenceDetailsUrl(
  slug: ReferenceDomainSlug,
  query?: Record<string, string | undefined | null>,
): string {
  const params = new URLSearchParams();
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      const trimmed = value == null ? '' : String(value).trim();
      if (trimmed !== '') params.set(key, trimmed);
    }
  }
  const qs = params.toString();
  return qs
    ? `/dashboard/references/${slug}?${qs}`
    : `/dashboard/references/${slug}`;
}
