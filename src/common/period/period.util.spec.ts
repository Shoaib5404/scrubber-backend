import { BadRequestException } from '@nestjs/common';
import { resolvePeriod, parsePeriodBound } from './period.util';

describe('period.util', () => {
  describe('parsePeriodBound', () => {
    it('parses YYYY-MM-DD as UTC day bounds', () => {
      const start = parsePeriodBound('2026-10-01', 'start');
      const end = parsePeriodBound('2026-10-01', 'end');
      expect(start.toISOString()).toBe('2026-10-01T00:00:00.000Z');
      expect(end.toISOString()).toBe('2026-10-01T23:59:59.999Z');
    });

    it('rejects invalid dates', () => {
      expect(() => parsePeriodBound('not-a-date', 'start')).toThrow(
        BadRequestException,
      );
    });
  });

  describe('resolvePeriod', () => {
    it('defaults to 30d window with start bound', () => {
      const window = resolvePeriod('30d');
      expect(window.period).toBe('30d');
      expect(window.period_start).toBeTruthy();
      expect(window.createdAtFilter?.gte).toBeInstanceOf(Date);
    });

    it('returns unbounded filter for all', () => {
      const window = resolvePeriod('all');
      expect(window.period_start).toBeNull();
      expect(window.createdAtFilter).toBeUndefined();
    });

    it('resolves today to start of UTC day', () => {
      const window = resolvePeriod('today');
      const start = new Date(window.period_start!);
      expect(start.getUTCHours()).toBe(0);
      expect(start.getUTCMinutes()).toBe(0);
      expect(window.createdAtFilter?.gte).toEqual(start);
    });

    it('treats 7d and 1w as 7-day windows', () => {
      const a = resolvePeriod('7d');
      const b = resolvePeriod('1w');
      const aStart = new Date(a.period_start!).getTime();
      const bStart = new Date(b.period_start!).getTime();
      const aEnd = new Date(a.period_end).getTime();
      const bEnd = new Date(b.period_end).getTime();
      expect(Math.round((aEnd - aStart) / 86400000)).toBe(7);
      expect(Math.round((bEnd - bStart) / 86400000)).toBe(7);
    });

    it('treats 1m like 30d', () => {
      const a = resolvePeriod('1m');
      const b = resolvePeriod('30d');
      const daysA = Math.round(
        (new Date(a.period_end).getTime() - new Date(a.period_start!).getTime()) /
          86400000,
      );
      const daysB = Math.round(
        (new Date(b.period_end).getTime() - new Date(b.period_start!).getTime()) /
          86400000,
      );
      expect(daysA).toBe(30);
      expect(daysB).toBe(30);
    });

    it('requires from for custom period', () => {
      expect(() => resolvePeriod('custom')).toThrow(BadRequestException);
    });

    it('resolves custom from/to range', () => {
      const window = resolvePeriod('custom', {
        from: '2026-09-01',
        to: '2026-09-15',
      });
      expect(window.period).toBe('custom');
      expect(window.period_start).toBe('2026-09-01T00:00:00.000Z');
      expect(window.period_end).toBe('2026-09-15T23:59:59.999Z');
      expect(window.createdAtFilter?.gte).toBeInstanceOf(Date);
      expect(window.createdAtFilter?.lte).toBeInstanceOf(Date);
    });

    it('rejects custom range when from is after to', () => {
      expect(() =>
        resolvePeriod('custom', { from: '2026-10-10', to: '2026-10-01' }),
      ).toThrow(BadRequestException);
    });
  });
});
