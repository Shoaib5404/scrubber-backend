import { isPastNyDailyAt, nyCalendarDateKey } from './npi-sync-schedule';

describe('npi-sync-schedule', () => {
  it('formats America/New_York calendar date as YYYY-MM-DD', () => {
    // 2026-03-08 05:30 UTC = 2026-03-08 00:30 EST (before spring forward)
    const d = new Date('2026-03-08T05:30:00.000Z');
    expect(nyCalendarDateKey(d)).toBe('2026-03-08');
  });

  it('is false before 06:00 America/New_York', () => {
    // 2026-06-15 09:59 UTC = 05:59 EDT
    const before = new Date('2026-06-15T09:59:00.000Z');
    expect(isPastNyDailyAt(6, 0, before)).toBe(false);
  });

  it('is true at/after 06:00 America/New_York', () => {
    // 2026-06-15 10:00 UTC = 06:00 EDT
    const at = new Date('2026-06-15T10:00:00.000Z');
    expect(isPastNyDailyAt(6, 0, at)).toBe(true);

    const after = new Date('2026-06-15T14:00:00.000Z');
    expect(isPastNyDailyAt(6, 0, after)).toBe(true);
  });
});
