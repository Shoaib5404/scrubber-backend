import {
  currentNpiSyncSlotKey,
  formatNpiSyncSlots,
  isPastNyDailyAt,
  nyCalendarDateKey,
} from './npi-sync-schedule';

describe('npi-sync-schedule', () => {
  it('formats America/New_York calendar date as YYYY-MM-DD', () => {
    // 2026-03-08 05:30 UTC = 2026-03-08 00:30 EST (before spring forward)
    const d = new Date('2026-03-08T05:30:00.000Z');
    expect(nyCalendarDateKey(d)).toBe('2026-03-08');
  });

  it('formats slots for logs', () => {
    expect(formatNpiSyncSlots()).toBe('00:00 and 12:00');
  });

  it('isPastNyDailyAt is false before and true at/after a given NY wall clock', () => {
    // 2026-06-15 09:59 UTC = 05:59 EDT
    expect(isPastNyDailyAt(6, 0, new Date('2026-06-15T09:59:00.000Z'))).toBe(false);
    // 2026-06-15 10:00 UTC = 06:00 EDT
    expect(isPastNyDailyAt(6, 0, new Date('2026-06-15T10:00:00.000Z'))).toBe(true);
  });

  describe('currentNpiSyncSlotKey (00:00 and 12:00 America/New_York)', () => {
    it('returns T00 just after midnight NY (EDT)', () => {
      // 2026-06-15 04:00 UTC = 00:00 EDT
      const atMidnight = new Date('2026-06-15T04:00:00.000Z');
      expect(currentNpiSyncSlotKey(atMidnight)).toBe('2026-06-15T00');

      // 2026-06-15 04:30 UTC = 00:30 EDT
      const afterMidnight = new Date('2026-06-15T04:30:00.000Z');
      expect(currentNpiSyncSlotKey(afterMidnight)).toBe('2026-06-15T00');
    });

    it('stays on T00 before noon NY', () => {
      // 2026-06-15 15:59 UTC = 11:59 EDT
      const beforeNoon = new Date('2026-06-15T15:59:00.000Z');
      expect(currentNpiSyncSlotKey(beforeNoon)).toBe('2026-06-15T00');
    });

    it('returns T12 at and after noon NY', () => {
      // 2026-06-15 16:00 UTC = 12:00 EDT
      const atNoon = new Date('2026-06-15T16:00:00.000Z');
      expect(currentNpiSyncSlotKey(atNoon)).toBe('2026-06-15T12');

      // 2026-06-15 20:00 UTC = 16:00 EDT
      const afternoon = new Date('2026-06-15T20:00:00.000Z');
      expect(currentNpiSyncSlotKey(afternoon)).toBe('2026-06-15T12');
    });

    it('uses distinct morning vs afternoon keys on the same day', () => {
      const morning = new Date('2026-06-15T10:00:00.000Z'); // 06:00 EDT
      const afternoon = new Date('2026-06-15T18:00:00.000Z'); // 14:00 EDT
      expect(currentNpiSyncSlotKey(morning)).toBe('2026-06-15T00');
      expect(currentNpiSyncSlotKey(afternoon)).toBe('2026-06-15T12');
      expect(currentNpiSyncSlotKey(morning)).not.toBe(currentNpiSyncSlotKey(afternoon));
    });

    it('handles EST (winter) midnight and noon', () => {
      // 2026-01-15 05:00 UTC = 00:00 EST
      expect(currentNpiSyncSlotKey(new Date('2026-01-15T05:00:00.000Z'))).toBe('2026-01-15T00');
      // 2026-01-15 17:00 UTC = 12:00 EST
      expect(currentNpiSyncSlotKey(new Date('2026-01-15T17:00:00.000Z'))).toBe('2026-01-15T12');
    });

    it('returns null when no slots are configured', () => {
      expect(currentNpiSyncSlotKey(new Date('2026-06-15T16:00:00.000Z'), [])).toBeNull();
    });
  });
});
