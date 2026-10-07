import * as path from 'path';

/**
 * Laravel NpiOrderingReferringDownloader::standardCsvFilename /
 * ImportNpiOrderingReferrings::defaultFilePath helpers, ported as pure UTC date-only
 * arithmetic — Laravel's app timezone is UTC (config/app.php), and the disabled
 * `npi-ordering-referrings:sync` schedule targets America/New_York only for *when* the job would
 * run, never for how the release-date calendar day is computed/formatted. Keeping all date math
 * UTC-only here means DST transitions in America/New_York can never shift the computed filename
 * or release date, regardless of whether that schedule is ever re-enabled.
 */

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

const YMD_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const FILENAME_PATTERN = /^([A-Za-z]+)_(\d{1,2})_(\d{4})\.csv$/;
const RELEASE_DATE_FOLDER_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Parses a `YYYY-MM-DD` string into a UTC-midnight `Date`, or null if malformed/invalid. */
export function parseYmdUtc(value: string): Date | null {
  const match = YMD_PATTERN.exec(value.trim());
  if (!match) {
    return null;
  }
  const [, yearStr, monthStr, dayStr] = match;
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }
  return date;
}

/** `Date` -> `YYYY-MM-DD`, UTC calendar fields only. */
export function formatYmdUtc(date: Date): string {
  const y = String(date.getUTCFullYear()).padStart(4, '0');
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Laravel `now()->subDay()` — app timezone is UTC, so this is UTC-today minus one calendar day. */
export function yesterdayUtcYmd(): string {
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  today.setUTCDate(today.getUTCDate() - 1);
  return formatYmdUtc(today);
}

/**
 * Laravel NpiOrderingReferringDownloader::standardCsvFilename —
 * `Carbon::createFromFormat('Y-m-d', $releaseDateYmd)->format('F_j_Y') . '.csv'`.
 * Throws on an invalid `releaseDateYmd` (mirrors Carbon throwing on parse failure).
 */
export function standardCsvFilename(releaseDateYmd: string): string {
  const date = parseYmdUtc(releaseDateYmd);
  if (!date) {
    throw new Error(`Invalid release date (expected Y-m-d): ${releaseDateYmd}`);
  }
  const month = MONTH_NAMES[date.getUTCMonth()];
  return `${month}_${date.getUTCDate()}_${date.getUTCFullYear()}.csv`;
}

/**
 * Laravel NpiOrderingReferringDownloader::parseCsvFilenameDate — reverses
 * `standardCsvFilename`, returning `Y-m-d` or null when the filename doesn't match/parse.
 */
export function parseCsvFilenameDate(filename: string): string | null {
  const match = FILENAME_PATTERN.exec(filename);
  if (!match) {
    return null;
  }
  const [, monthName, dayStr, yearStr] = match;
  const monthIndex = MONTH_NAMES.findIndex(
    (name) => name.toLowerCase() === monthName.toLowerCase(),
  );
  if (monthIndex === -1) {
    return null;
  }
  const day = Number(dayStr);
  const year = Number(yearStr);
  const date = new Date(Date.UTC(year, monthIndex, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== monthIndex || date.getUTCDate() !== day) {
    return null;
  }
  return formatYmdUtc(date);
}

/** Laravel NpiOrderingReferringDownloader::isReleaseDateFolder. */
export function isReleaseDateFolderName(folderName: string): boolean {
  return RELEASE_DATE_FOLDER_PATTERN.test(folderName) && parseYmdUtc(folderName) !== null;
}

/** Laravel NpiOrderingReferringDownloader::formatBytes. */
export function formatBytes(bytes: number): string {
  if (bytes >= 1_073_741_824) {
    return `${Math.round((bytes / 1_073_741_824) * 100) / 100} GB`;
  }
  if (bytes >= 1_048_576) {
    return `${Math.round((bytes / 1_048_576) * 100) / 100} MB`;
  }
  if (bytes >= 1024) {
    return `${Math.round((bytes / 1024) * 100) / 100} KB`;
  }
  return `${bytes} B`;
}

/**
 * Laravel ImportNpiOrderingReferrings::defaultFilePath —
 * `<importDirectory>/<Month>_<Day>_<Year>.csv` for `--date` (Y-m-d) or yesterday (UTC) by default.
 */
export function defaultNpiImportFilePath(importDirectory: string, dateOption?: string): string {
  const releaseDateYmd = dateOption ?? yesterdayUtcYmd();
  return path.join(importDirectory, standardCsvFilename(releaseDateYmd));
}

/** Resolves the configured import directory (default `import/NPI_Ordering_Referring`) to an absolute path. */
export function resolveNpiImportDirectory(configuredValue: string): string {
  return path.isAbsolute(configuredValue) ? configuredValue : path.resolve(process.cwd(), configuredValue);
}
