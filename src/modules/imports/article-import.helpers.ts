/**
 * Laravel App\Console\Commands\ImportArticleData header normalization — `strtolower(trim($h))`
 * after stripping a leading UTF-8 BOM. Unlike `import.utils.normalizeHeader` (used by the
 * punctuation-collapsing CSV importers), this does NOT replace punctuation with underscores:
 * article CSV headers already match the `information_schema.columns` names verbatim once
 * lowercased, and collapsing e.g. `article_id` would be a no-op but collapsing a stray header
 * Laravel doesn't touch (like a trailing space) must behave identically to `trim()` only.
 */
export function normalizeArticleHeader(header: string): string {
  return header.replace(/^\uFEFF/, '').trim().toLowerCase();
}

const EMPTY_DATE_PATTERN = /^(1900-01-01|1899-12-30)( 00:00:00)?$/;
const FRACTIONAL_DATETIME_PATTERN = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d+$/;

/**
 * Laravel ImportArticleData::cleanValue — trim, blank-to-null, Excel epoch dates
 * (1900-01-01 / 1899-12-30) to null, and truncate fractional-second timestamps to
 * second precision (`substr($value, 0, 19)`).
 *
 * Laravel's companion `ensureUtf8()` (Windows-1252 byte repair) is intentionally not ported:
 * Node's CSV/XLSX readers (`csv-parse`, `exceljs`) already decode the source bytes to proper
 * JS strings (UTF-16), so there are no raw invalid-UTF-8 byte sequences left to repair by the
 * time a value reaches this function — see SP-8 Task 19 group 12 notes.
 */
export function cleanValue(value: string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const trimmed = value.trim();
  if (trimmed === '') {
    return null;
  }

  if (EMPTY_DATE_PATTERN.test(trimmed)) {
    return null;
  }

  if (FRACTIONAL_DATETIME_PATTERN.test(trimmed)) {
    return trimmed.slice(0, 19);
  }

  return trimmed;
}

/** Laravel ImportArticleData::isEmptyRow — every cell is null/blank after trimming. */
export function isEmptyRow(row: readonly (string | null | undefined)[]): boolean {
  for (const cell of row) {
    if (cell !== null && cell !== undefined && cell.trim() !== '') {
      return false;
    }
  }
  return true;
}
