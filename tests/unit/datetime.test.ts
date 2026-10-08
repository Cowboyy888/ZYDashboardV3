import { describe, it, expect } from 'vitest';
import {
  businessDate,
  localToUtc,
  startOfBusinessDayUtc,
  endOfBusinessDayUtc,
  formatDDMMYYYY,
  formatDateTime,
  addDays,
  tzOffsetMinutes,
  startOfWeek,
  weekRange,
} from '@/lib/domain/datetime';

const TZ = 'Asia/Bangkok'; // UTC+7, no DST

describe('timezone handling (Asia/Bangkok)', () => {
  it('offset is +420 minutes', () => {
    expect(tzOffsetMinutes(new Date('2026-07-24T00:00:00Z'), TZ)).toBe(420);
  });

  it('preserves the local business date across the UTC boundary', () => {
    // 22:30 UTC on the 24th is 05:30 local on the 25th.
    const instant = new Date('2026-07-24T22:30:00Z');
    expect(businessDate(instant, TZ)).toBe('2026-07-25');
    // 16:00 UTC on the 24th is 23:00 local, still the 24th.
    expect(businessDate(new Date('2026-07-24T16:00:00Z'), TZ)).toBe('2026-07-24');
  });

  it('converts a local wall-clock time to the correct UTC instant', () => {
    // 08:00 local on 2026-07-24 == 01:00 UTC.
    expect(localToUtc('2026-07-24', '08:00', TZ).toISOString()).toBe('2026-07-24T01:00:00.000Z');
    // 18:00 local == 11:00 UTC.
    expect(localToUtc('2026-07-24', '18:00', TZ).toISOString()).toBe('2026-07-24T11:00:00.000Z');
  });

  it('computes start/end of a business day in UTC', () => {
    expect(startOfBusinessDayUtc('2026-07-24', TZ).toISOString()).toBe('2026-07-23T17:00:00.000Z');
    expect(endOfBusinessDayUtc('2026-07-24', TZ).toISOString()).toBe('2026-07-24T17:00:00.000Z');
  });
});

describe('display formatting', () => {
  it('formats dates as dd/mm/yyyy', () => {
    expect(formatDDMMYYYY('2026-07-24')).toBe('24/07/2026');
    expect(formatDDMMYYYY(new Date('2026-01-05T10:00:00Z'), TZ)).toBe('05/01/2026');
  });

  it('formats a datetime in the app timezone', () => {
    // 01:00 UTC -> 08:00 local
    expect(formatDateTime('2026-07-24T01:00:00Z', TZ)).toBe('24/07/2026 08:00');
  });

  it('adds and subtracts days on business dates', () => {
    expect(addDays('2026-07-24', 1)).toBe('2026-07-25');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });
});

describe('week boundaries (Monday start, for the Weekly Team Performance dashboard)', () => {
  it('finds Monday for a mid-week date', () => {
    // 2026-07-24 is a Friday -> Monday of that week is 2026-07-20.
    expect(startOfWeek('2026-07-24')).toBe('2026-07-20');
  });

  it('a Monday maps to itself', () => {
    expect(startOfWeek('2026-07-20')).toBe('2026-07-20');
  });

  it('a Sunday belongs to the week that started the previous Monday', () => {
    expect(startOfWeek('2026-07-26')).toBe('2026-07-20');
  });

  it('weekRange returns the Monday..Sunday pair', () => {
    expect(weekRange('2026-07-24')).toEqual({ start: '2026-07-20', end: '2026-07-26' });
  });

  it('weekRange spans a month/year boundary correctly', () => {
    // 2026-12-31 is a Thursday -> Monday 2026-12-28, Sunday 2027-01-03.
    expect(weekRange('2026-12-31')).toEqual({ start: '2026-12-28', end: '2027-01-03' });
  });
});
