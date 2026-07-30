import { describe, it, expect } from 'vitest';
import {
  dueReports,
  reportGroup,
  isValidHHmm,
  timeToMinutes,
  isBeforeManualEntry,
  type ScheduleSettings,
  type ScheduledReportType,
} from '@/lib/domain/report-schedule';
import { currentLocalTime, APP_TIMEZONE } from '@/lib/domain/datetime';

const base: ScheduleSettings = {
  morningTime: '08:00',
  afternoonTime: '13:00',
  inventoryTime: '18:00',
  morningEnabled: true,
  afternoonEnabled: true,
  inventoryEnabled: true,
};
const settings = (o: Partial<ScheduleSettings> = {}): ScheduleSettings => ({ ...base, ...o });

describe('HH:mm helpers', () => {
  it('validates 24h HH:mm', () => {
    expect(isValidHHmm('08:00')).toBe(true);
    expect(isValidHHmm('23:59')).toBe(true);
    expect(isValidHHmm('24:00')).toBe(false);
    expect(isValidHHmm('8:00')).toBe(false);
    expect(isValidHHmm('12:60')).toBe(false);
    expect(isValidHHmm('')).toBe(false);
  });
  it('converts to minutes since midnight', () => {
    expect(timeToMinutes('00:00')).toBe(0);
    expect(timeToMinutes('08:00')).toBe(480);
    expect(timeToMinutes('13:30')).toBe(810);
  });
});

describe('routing — Attendance Group vs Inventory Group', () => {
  it('maps each report type to the correct group', () => {
    expect(reportGroup('attendance_morning')).toBe('attendance');
    expect(reportGroup('attendance_afternoon')).toBe('attendance');
    expect(reportGroup('inventory')).toBe('inventory');
  });

  it('due attendance reports route to attendance; due inventory routes to inventory', () => {
    // 13:00 with morning already sent -> only the afternoon attendance report.
    const att = dueReports({
      nowLocal: '13:00',
      settings: settings(),
      alreadySent: ['attendance_morning'],
    });
    expect(att).toEqual(['attendance_afternoon']);
    expect(att.map(reportGroup)).toEqual(['attendance']);

    // 18:00 with both attendance reports sent -> only the inventory report.
    const inv = dueReports({
      nowLocal: '18:00',
      settings: settings(),
      alreadySent: ['attendance_morning', 'attendance_afternoon'],
    });
    expect(inv).toEqual(['inventory']);
    expect(inv.map(reportGroup)).toEqual(['inventory']);
  });
});

describe('dueReports — dynamic saved times (no hard-coded schedule)', () => {
  it('fires a report only once its configured time is reached', () => {
    expect(dueReports({ nowLocal: '07:59', settings: settings() })).toEqual([]);
    expect(dueReports({ nowLocal: '08:00', settings: settings() })).toEqual(['attendance_morning']);
  });

  it('honours a CHANGED time — a later morning time delays the send', () => {
    const later = settings({ morningTime: '09:30' });
    expect(dueReports({ nowLocal: '09:00', settings: later })).toEqual([]);
    expect(dueReports({ nowLocal: '09:30', settings: later })).toEqual(['attendance_morning']);
  });

  it('never fires a disabled report even past its time', () => {
    const off = settings({ morningEnabled: false });
    expect(dueReports({ nowLocal: '12:00', settings: off })).toEqual([]);
  });

  it('collects every report whose time has passed', () => {
    // Late evening, nothing sent yet -> all three are due.
    expect(dueReports({ nowLocal: '19:00', settings: settings() })).toEqual([
      'attendance_morning',
      'attendance_afternoon',
      'inventory',
    ]);
  });
});

describe('idempotency — at most once per Cambodia business date', () => {
  it('skips a report already sent today, even after its time is changed', () => {
    // Admin moved the morning time earlier to 06:00, but it already went out.
    const changed = settings({ morningTime: '06:00' });
    const due = dueReports({
      nowLocal: '10:00',
      settings: changed,
      alreadySent: ['attendance_morning'],
    });
    expect(due).not.toContain('attendance_morning');
  });

  it('does not resend any already-sent report', () => {
    const due = dueReports({
      nowLocal: '23:00',
      settings: settings(),
      alreadySent: ['attendance_morning', 'attendance_afternoon', 'inventory'],
    });
    expect(due).toEqual([]);
  });
});

describe('timezone handling — Asia/Bangkok drives "now"', () => {
  // Bangkok is UTC+7 year-round.
  const at = (iso: string): string => currentLocalTime(APP_TIMEZONE, new Date(iso));

  it('derives the correct local HH:mm from a UTC instant', () => {
    expect(at('2026-07-25T01:00:00Z')).toBe('08:00'); // 08:00 ICT
    expect(at('2026-07-25T06:00:00Z')).toBe('13:00'); // 13:00 ICT
    expect(at('2026-07-25T11:00:00Z')).toBe('18:00'); // 18:00 ICT
  });

  it('the 08:00 ICT tick makes exactly the morning report due', () => {
    const nowLocal = at('2026-07-25T01:00:00Z');
    expect(dueReports({ nowLocal, settings: settings() })).toEqual(['attendance_morning']);
  });

  it('a UTC instant just before 08:00 ICT does not fire the morning report', () => {
    const nowLocal = at('2026-07-25T00:59:00Z'); // 07:59 ICT
    expect(dueReports({ nowLocal, settings: settings() })).toEqual([]);
  });
});

describe('manual-entry warning thresholds (warn, never block)', () => {
  it('flags an attendance time earlier than its manual-entry time', () => {
    expect(isBeforeManualEntry('attendance_morning', '07:00')).toBe(true);
    expect(isBeforeManualEntry('attendance_morning', '07:30')).toBe(false); // exactly at = ok
    expect(isBeforeManualEntry('attendance_morning', '08:00')).toBe(false);
    expect(isBeforeManualEntry('attendance_afternoon', '12:00')).toBe(true);
    expect(isBeforeManualEntry('attendance_afternoon', '12:30')).toBe(false);
  });

  it('never flags the inventory report (no manual-entry threshold)', () => {
    expect(isBeforeManualEntry('inventory', '00:00')).toBe(false);
    expect(isBeforeManualEntry('inventory', '05:00')).toBe(false);
  });

  it('ignores malformed times', () => {
    expect(isBeforeManualEntry('attendance_morning', 'oops')).toBe(false);
  });
});

// Type-level guard: the exhaustive union is exercised above.
const _types: ScheduledReportType[] = ['attendance_morning', 'attendance_afternoon', 'inventory'];
void _types;
