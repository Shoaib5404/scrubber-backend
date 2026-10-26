/** Timezone for scheduled npi-ordering-referrings:sync. */
export const NPI_SYNC_TZ = 'America/New_York';

export type NpiSyncSlot = { hour: number; minute: number };

/**
 * Twice-daily wall clocks in America/New_York (00:00 and 12:00).
 * Ordered ascending by time-of-day.
 */
export const NPI_SYNC_SLOTS: readonly NpiSyncSlot[] = [
  { hour: 0, minute: 0 },
  { hour: 12, minute: 0 },
] as const;

/** Human-readable schedule for logs, e.g. "00:00 and 12:00". */
export function formatNpiSyncSlots(slots: readonly NpiSyncSlot[] = NPI_SYNC_SLOTS): string {
  return slots
    .map((s) => `${String(s.hour).padStart(2, '0')}:${String(s.minute).padStart(2, '0')}`)
    .join(' and ');
}

/** Calendar date (YYYY-MM-DD) in America/New_York. */
export function nyCalendarDateKey(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: NPI_SYNC_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** Local hour/minute in America/New_York. */
export function nyLocalTimeParts(now: Date = new Date()): { hour: number; minute: number } | null {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: NPI_SYNC_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);

  const hour = Number(parts.find((p) => p.type === 'hour')?.value);
  const minute = Number(parts.find((p) => p.type === 'minute')?.value);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
    return null;
  }
  return { hour, minute };
}

/** True when local America/New_York time is at/after the given wall clock. */
export function isPastNyDailyAt(
  hour: number,
  minute: number,
  now: Date = new Date(),
): boolean {
  const local = nyLocalTimeParts(now);
  if (local === null) {
    return false;
  }
  return local.hour > hour || (local.hour === hour && local.minute >= minute);
}

/**
 * Slot key for the latest twice-daily window that has already started in NY time.
 * Examples: `2026-10-26T00`, `2026-10-26T12`.
 * Returns `null` if local time cannot be resolved or no slot has started yet
 * (not applicable for a 00:00 first slot on a normal calendar day).
 */
export function currentNpiSyncSlotKey(
  now: Date = new Date(),
  slots: readonly NpiSyncSlot[] = NPI_SYNC_SLOTS,
): string | null {
  const local = nyLocalTimeParts(now);
  if (local === null || slots.length === 0) {
    return null;
  }

  const dateKey = nyCalendarDateKey(now);
  let due: NpiSyncSlot | null = null;
  for (const slot of slots) {
    if (local.hour > slot.hour || (local.hour === slot.hour && local.minute >= slot.minute)) {
      due = slot;
    }
  }

  if (due === null) {
    return null;
  }

  return `${dateKey}T${String(due.hour).padStart(2, '0')}`;
}
