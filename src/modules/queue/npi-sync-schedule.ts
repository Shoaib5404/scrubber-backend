/** Laravel schedule timezone for npi-ordering-referrings:sync. */
export const NPI_SYNC_TZ = 'America/New_York';

/** Laravel dailyAt('06:00'). */
export const NPI_SYNC_HOUR = 6;
export const NPI_SYNC_MINUTE = 0;

/** Calendar date (YYYY-MM-DD) in America/New_York. */
export function nyCalendarDateKey(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: NPI_SYNC_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** True when local America/New_York time is at/after the daily sync wall clock. */
export function isPastNyDailyAt(
  hour: number = NPI_SYNC_HOUR,
  minute: number = NPI_SYNC_MINUTE,
  now: Date = new Date(),
): boolean {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: NPI_SYNC_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);

  const h = Number(parts.find((p) => p.type === 'hour')?.value);
  const m = Number(parts.find((p) => p.type === 'minute')?.value);
  if (!Number.isFinite(h) || !Number.isFinite(m)) {
    return false;
  }
  return h > hour || (h === hour && m >= minute);
}
