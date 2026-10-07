export function normalizePayerId(payerId: string | null | undefined): string {
  const normalized = String(payerId ?? '').trim();
  return normalized;
}

export function normalizePos(code: string | null | undefined): string | null {
  const trimmed = String(code ?? '').trim();
  if (trimmed === '') return null;
  return trimmed.padStart(2, '0');
}

export function digitsOnly(value: string): string {
  return value.replace(/\D/g, '');
}

export function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function formatYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseClaimDate(value: Date | string | null | undefined): Date | null {
  if (value == null) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return startOfLocalDay(value);
  }
  const normalized = String(value).trim();
  if (normalized === '' || normalized.startsWith('0001-01-01')) return null;
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return null;
  return startOfLocalDay(parsed);
}

export function hasValidAdmissionDate(admissionDate: Date | string | null | undefined): boolean {
  if (admissionDate == null) return false;
  if (admissionDate instanceof Date) return admissionDate.getFullYear() > 1;
  const normalized = String(admissionDate).trim();
  if (normalized === '' || normalized.startsWith('0001-01-01')) return false;
  return true;
}

export function isValidAccidentDate(value: Date | string | null | undefined, today: Date): boolean {
  if (value == null) return false;
  if (typeof value === 'string') {
    const normalized = value.trim();
    if (normalized === '' || normalized.startsWith('0001-01-01')) return false;
  }
  const date = parseClaimDate(value);
  if (date == null) return false;
  return date.getTime() <= today.getTime();
}

export function claimHasRelatedCausesCode(
  raw: string | null | undefined,
  allowedCodes: readonly string[],
): boolean {
  const upper = String(raw ?? '')
    .trim()
    .toUpperCase();
  if (upper === '') return false;
  const parts = upper.split(/[:;,|\s]+/);
  for (const part of parts) {
    const code = part.trim();
    if (code !== '' && allowedCodes.includes(code)) return true;
  }
  return false;
}

/** Minimal Laravel ZipCodeValidator::parseCityFromFullAddress for city scrubbing. */
export function parseCityFromFullAddress(address: string | null | undefined): string {
  const raw = String(address ?? '').trim();
  if (raw === '') return '';
  const parts = raw
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p !== '');
  if (parts.length === 0) return '';
  let work = [...parts];
  const last = work[work.length - 1] ?? '';
  const lastDigits = digitsOnly(last);
  if (lastDigits.length >= 5) {
    work.pop();
    const maybeState = work[work.length - 1] ?? '';
    if (/^[A-Za-z]{2}$/.test(maybeState)) work.pop();
  }
  return work[work.length - 1] ?? '';
}
