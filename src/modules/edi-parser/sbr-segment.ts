/**
 * Helpers for parsing X12 SBR (subscriber information) segments.
 */
export function sbrClaimFilingIndicator(elements: string[] | null | undefined): string | null {
  if (elements == null) {
    return null;
  }

  for (const index of [9, 10]) {
    const value = (elements[index] ?? '').trim().toUpperCase();
    if (value !== '') {
      return value;
    }
  }

  return null;
}
