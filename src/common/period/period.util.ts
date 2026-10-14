import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

/** Presets + custom range. `30d` kept as alias of `1m` for backward compatibility. */
export const ACTIVITY_PERIODS = [
  'today',
  '7d',
  '1w',
  '1m',
  '30d',
  'all',
  'custom',
] as const;
export type ActivityPeriod = (typeof ACTIVITY_PERIODS)[number];

export type PeriodRangeInput = {
  from?: string | null;
  to?: string | null;
};

export type PeriodFilter = PeriodRangeInput & {
  period?: ActivityPeriod;
};

export type PeriodWindow = {
  period: ActivityPeriod;
  period_start: string | null;
  period_end: string;
  createdAtFilter: Prisma.DateTimeFilter | undefined;
};

function startOfUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

function endOfUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      23,
      59,
      59,
      999,
    ),
  );
}

/** Accepts `YYYY-MM-DD` or full ISO timestamps. */
export function parsePeriodBound(
  value: string,
  bound: 'start' | 'end',
): Date {
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const day = new Date(`${trimmed}T00:00:00.000Z`);
    if (Number.isNaN(day.getTime())) {
      throw new BadRequestException(`Invalid date: ${value}`);
    }
    return bound === 'start' ? startOfUtcDay(day) : endOfUtcDay(day);
  }
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestException(`Invalid date: ${value}`);
  }
  return parsed;
}

function rollingDaysBack(end: Date, days: number): Date {
  return new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
}

/**
 * Resolve a period preset or custom from/to into a Prisma createdAt window.
 * - today: start of UTC day → now
 * - 7d / 1w: last 7 days
 * - 1m / 30d: last 30 days
 * - all: unbounded
 * - custom: requires `from`; `to` defaults to now
 */
export function resolvePeriod(
  period: ActivityPeriod = '30d',
  range?: PeriodRangeInput,
): PeriodWindow {
  const period_end = new Date();

  if (period === 'all') {
    return {
      period,
      period_start: null,
      period_end: period_end.toISOString(),
      createdAtFilter: undefined,
    };
  }

  if (period === 'custom') {
    const fromRaw = range?.from?.trim();
    if (!fromRaw) {
      throw new BadRequestException(
        'Custom period requires a from date (YYYY-MM-DD).',
      );
    }
    const start = parsePeriodBound(fromRaw, 'start');
    const toRaw = range?.to?.trim();
    const end = toRaw ? parsePeriodBound(toRaw, 'end') : period_end;
    if (start.getTime() > end.getTime()) {
      throw new BadRequestException(
        'Custom period from date must be on or before to date.',
      );
    }
    return {
      period,
      period_start: start.toISOString(),
      period_end: end.toISOString(),
      createdAtFilter: { gte: start, lte: end },
    };
  }

  let start: Date;
  if (period === 'today') {
    start = startOfUtcDay(period_end);
  } else if (period === '7d' || period === '1w') {
    start = rollingDaysBack(period_end, 7);
  } else {
    // 1m and legacy 30d
    start = rollingDaysBack(period_end, 30);
  }

  return {
    period,
    period_start: start.toISOString(),
    period_end: period_end.toISOString(),
    createdAtFilter: { gte: start, lte: period_end },
  };
}

export function resolvePeriodFilter(filter: PeriodFilter = {}): PeriodWindow {
  return resolvePeriod(filter.period ?? '30d', {
    from: filter.from,
    to: filter.to,
  });
}
