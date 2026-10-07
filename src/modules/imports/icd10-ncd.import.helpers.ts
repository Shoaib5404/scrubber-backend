import { excelSerialToDate } from './import.utils';

/**
 * Laravel App\Console\Commands\ImportIcd10Ncd — standalone state-machine helpers.
 *
 * These intentionally do NOT reuse the default `Icd10RangeExpander` (which uppercases and
 * strips dots for tabular-range lookups against `icd10_tabular_codes`). ImportIcd10Ncd's own
 * `normalizeCode`/`expandIcdRange`/`splitIcdPrefixAndNumericSuffix` never uppercase and never
 * strip dots — codes are stored exactly as the workbook presents them (minus a leading CMS
 * change-marker `*`).
 */

/** Laravel ImportIcd10Ncd::CHANGE_MARKER_CHAR — leading '*' marks a CMS spreadsheet change. */
export function stripChangeMarker(value: string): string {
  return value.replace(/^\*+/, '');
}

/**
 * Laravel ImportIcd10Ncd::normalizeCode. Input here is already a plain string (loadExcelRows
 * stringifies every cell — RichText/int/float handling from the PHP original is therefore
 * unnecessary); only trims and strips a leading change marker.
 */
export function normalizeCode(value: string | null | undefined): string | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const stripped = stripChangeMarker(value.trim());
  return stripped === '' ? null : stripped;
}

/**
 * Laravel ImportIcd10Ncd::isIcdRowMarkerToSkip — section break: ICD cell is only `@` characters
 * and at least 6 long (e.g. `@@@@@@`).
 */
export function isIcdRowMarkerToSkip(plainIcdCell: string): boolean {
  const trimmed = plainIcdCell.trim();
  return trimmed.length >= 6 && /^@+$/.test(trimmed);
}

/**
 * Laravel ImportIcd10Ncd::parseCptListFromCell — column C may list multiple CPT/HCPCS codes
 * separated by whitespace, commas, or semicolons (e.g. "87086, 87088"). Order of first
 * occurrence is preserved (Laravel array_unique + array_values semantics).
 */
export function parseCptListFromCell(raw: string | null | undefined): string[] {
  if (raw === null || raw === undefined) {
    return [];
  }
  const trimmed = raw.trim();
  if (trimmed === '') {
    return [];
  }

  const parts = trimmed.split(/[\s,;]+/).filter((part) => part !== '');
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of parts) {
    const code = normalizeCode(part.trim());
    if (code !== null && code !== '' && !seen.has(code)) {
      seen.add(code);
      out.push(code);
    }
  }
  return out;
}

/** Laravel ImportIcd10Ncd::parseResolution. */
export function parseResolution(value: string | null | undefined): number {
  if (value === null || value === undefined || value === '') {
    return 0;
  }
  const stripped = stripChangeMarker(value.trim());
  if (stripped === '') {
    return 0;
  }
  if (/^-?\d+(\.\d+)?$/.test(stripped)) {
    return Math.trunc(Number(stripped));
  }
  const digits = stripped.replace(/\D/g, '');
  return digits === '' ? 0 : Number.parseInt(digits, 10);
}

/**
 * Laravel ImportIcd10Ncd::parseDate — strips a leading change marker before parsing. Handles
 * 8-digit YYYYMMDD strings and Excel serials (loadExcelRows stringifies Date cells to
 * "YYYYMMDD" and serial-looking numbers to plain digit strings — see excelCellToTrimmedString
 * in import.utils.ts), then falls back to a generic Date.parse.
 */
export function parseIcd10NcdDate(value: string | null | undefined): Date | null {
  if (value === null || value === undefined) {
    return null;
  }
  const trimmed = value.trim();
  if (trimmed === '') {
    return null;
  }
  const stripped = stripChangeMarker(trimmed);
  if (stripped === '') {
    return null;
  }

  if (/^\d{8}$/.test(stripped)) {
    const y = Number.parseInt(stripped.slice(0, 4), 10);
    const m = Number.parseInt(stripped.slice(4, 6), 10);
    const d = Number.parseInt(stripped.slice(6, 8), 10);
    const date = new Date(Date.UTC(y, m - 1, d));
    return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
      ? date
      : null;
  }

  if (/^\d+(\.\d+)?$/.test(stripped) && Number(stripped) < 100000) {
    return excelSerialToDate(Number(stripped));
  }

  const parsed = Date.parse(stripped);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  const date = new Date(parsed);
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
}

/**
 * Laravel ImportIcd10Ncd::splitIcdPrefixAndNumericSuffix.
 *
 * @returns [prefix, digit run as string, int value] or null when the string has no trailing
 *   digit run.
 */
export function splitIcdPrefixAndNumericSuffix(value: string): [string, string, number] | null {
  const match = /^(.+?)(\d+)$/.exec(value);
  if (!match) {
    return null;
  }
  const digits = match[2] ?? '';
  return [match[1] ?? '', digits, Number.parseInt(digits, 10)];
}

export interface IcdRangeExceeded {
  code: string;
  span: number;
  maxSpan: number;
}

export interface ExpandIcdRangeResult {
  codes: string[];
  /** Set only when the hyphenated range's span exceeded maxSpan and was stored as a literal. */
  rangeExceeded?: IcdRangeExceeded;
}

/**
 * Laravel ImportIcd10Ncd::expandIcdRange — expand hyphenated ICD ranges (e.g. A4150-A4153 ->
 * A4150..A4153 inclusive). Prefix and numeric width must match on both sides; otherwise the
 * literal code is returned unexpanded. No dots, no uppercasing (unlike the default
 * Icd10RangeExpander) — codes are stored exactly as given.
 */
export function expandIcdRange(code: string, maxSpan: number): ExpandIcdRangeResult {
  const trimmedCode = code.trim();
  if (trimmedCode === '') {
    return { codes: [] };
  }

  const dashIndex = trimmedCode.indexOf('-');
  if (dashIndex === -1) {
    return { codes: [trimmedCode] };
  }

  // Laravel: explode('-', $code, 2) — split only on the first hyphen.
  const left = trimmedCode.slice(0, dashIndex).trim();
  const right = trimmedCode.slice(dashIndex + 1).trim();
  if (left === '' || right === '') {
    return { codes: [trimmedCode] };
  }

  const l = splitIcdPrefixAndNumericSuffix(left);
  const r = splitIcdPrefixAndNumericSuffix(right);
  if (l === null || r === null) {
    return { codes: [trimmedCode] };
  }

  const [prefL, digitsL, intL] = l;
  const [prefR, digitsR, intR] = r;

  if (prefL !== prefR || digitsL.length !== digitsR.length || intL > intR) {
    return { codes: [trimmedCode] };
  }

  const span = intR - intL;
  if (span > maxSpan) {
    return { codes: [trimmedCode], rangeExceeded: { code: trimmedCode, span, maxSpan } };
  }

  const width = digitsL.length;
  const out: string[] = [];
  for (let n = intL; n <= intR; n += 1) {
    out.push(prefL + String(n).padStart(width, '0'));
  }
  return { codes: out };
}
