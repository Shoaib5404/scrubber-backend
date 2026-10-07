/**
 * Matches Laravel NdcHelper::normalizeFromImport (5-4-2 segments, 11-digit ndc_digits).
 */
export function normalizeNdcFromImport(raw: string | null | undefined): {
  ndc: string;
  ndcDigits: string;
} | null {
  if (raw === null || raw === undefined || String(raw).trim() === '') {
    return null;
  }

  const trimmed = String(raw).trim();
  let segment1: string;
  let segment2: string;
  let segment3: string;

  if (trimmed.includes('-')) {
    const parts = trimmed.split('-', 3);
    if (parts.length !== 3) {
      return null;
    }
    segment1 = (parts[0]?.replace(/\D/g, '') ?? '');
    segment2 = (parts[1]?.replace(/\D/g, '') ?? '');
    segment3 = (parts[2]?.replace(/\D/g, '') ?? '');
    if (segment1 === '' || segment2 === '' || segment3 === '') {
      return null;
    }
    if (segment1.length > 5 || segment2.length > 4 || segment3.length > 2) {
      return null;
    }
    segment1 = segment1.padStart(5, '0');
    segment2 = segment2.padStart(4, '0');
    segment3 = segment3.padStart(2, '0');
  } else {
    let digits = trimmed.replace(/\D/g, '');
    if (digits === '' || digits.length > 11) {
      return null;
    }
    digits = digits.padStart(11, '0');
    segment1 = digits.slice(0, 5);
    segment2 = digits.slice(5, 9);
    segment3 = digits.slice(9, 11);
  }

  const ndcDigits = segment1 + segment2 + segment3;
  return {
    ndc: `${segment1}-${segment2}-${segment3}`,
    ndcDigits,
  };
}
