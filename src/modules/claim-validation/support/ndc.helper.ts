/** Laravel NdcHelper::UNITS */
export const NDC_UNITS: readonly string[] = ['UN', 'ML', 'GR', 'F2', 'ME'];

/** Laravel NdcHelper::normalizeToElevenDigitCode */
export function normalizeNdcToElevenDigitCode(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined || String(raw).trim() === '') {
    return null;
  }

  const trimmed = String(raw).trim();

  if (trimmed.includes('-')) {
    return parseHyphenatedNdcSegments(trimmed);
  }

  const digits = trimmed.replace(/\D/g, '');
  if (digits === '') {
    return null;
  }

  return digits.length === 11 ? digits : null;
}

function parseHyphenatedNdcSegments(raw: string): string | null {
  const parts = raw.split('-', 3).map((part) => part.replace(/\D/g, ''));
  if (parts.length !== 3) {
    return null;
  }

  const [segment1, segment2, segment3] = parts;
  if (segment1 === '' || segment2 === '' || segment3 === '') {
    return null;
  }

  if (segment1.length !== 5 || segment2.length !== 4 || segment3.length !== 2) {
    return null;
  }

  const normalized = segment1 + segment2 + segment3;
  return normalized.length === 11 ? normalized : null;
}

/** Laravel NdcHelper::normalizeForLookup */
export function normalizeNdcForLookup(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined || String(raw).trim() === '') {
    return null;
  }

  const numeric = normalizeNdcToElevenDigitCode(raw);
  if (numeric !== null) {
    return numeric;
  }

  const alnum = String(raw)
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');

  return alnum.length === 11 ? alnum : null;
}

/** Laravel NdcHelper::normalizeHcpcs */
export function normalizeHcpcs(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined || String(raw).trim() === '') {
    return null;
  }

  const hcpcs = String(raw).trim().toUpperCase();
  return hcpcs !== '' ? hcpcs : null;
}

/** Laravel NdcHelper::pairKey */
export function ndcPairKey(ndcKey: string, hcpcsKey: string): string {
  return `${ndcKey}|${hcpcsKey}`;
}

/** Laravel NdcHelper::isValidCode */
export function isValidNdcCode(code: string | null | undefined): boolean {
  const normalized = normalizeNdcToElevenDigitCode(code);
  return normalized !== null && normalized.length === 11;
}

/** Laravel NdcHelper::matchesServiceIdRegex */
export function ndcMatchesServiceIdRegex(code: string | null | undefined): boolean {
  const key = normalizeNdcForLookup(code);
  return key !== null && /^[0-9A-Z]{11}$/.test(key);
}

/** Laravel NdcHelper::hasAnyNdcData */
export function hasAnyNdcData(
  code: string | null | undefined,
  quantity: unknown,
  unit: string | null | undefined,
): boolean {
  return trimmedOrNull(code) !== null || normalizeNdcQuantity(quantity) !== null || normalizeNdcUnit(unit) !== null;
}

function trimmedOrNull(value: string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const trimmed = String(value).trim();
  return trimmed !== '' ? trimmed : null;
}

function normalizeNdcQuantity(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') {
    return null;
  }
  return typeof raw === 'number' ? raw : Number.isFinite(Number(raw)) ? Number(raw) : null;
}

function normalizeNdcUnit(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined || String(raw).trim() === '') {
    return null;
  }
  return String(raw).trim().toUpperCase();
}
