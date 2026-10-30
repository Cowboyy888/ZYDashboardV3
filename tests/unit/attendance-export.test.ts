import { describe, expect, it } from 'vitest';
import {
  attendanceExportRows,
  parseAttendanceExportFilters,
} from '@/lib/reports/attendance-export';
import type { AttendanceGroupRow, AttendanceRow, EmployeeRow } from '@/lib/db/types';

function employee(
  id: string,
  code: string,
  location: 'office' | 'factory' | null,
  active = true,
): EmployeeRow {
  return {
    id,
    employee_code: code,
    seq_no: Number(code.slice(-1)),
    name_khmer: null,
    name_english: code,
    name_chinese: null,
    phone: null,
    department: null,
    position: null,
    work_location: location,
    start_date: null,
    is_active: active,
    pay_type: 'daily',
    photo_path: null,
    photo_thumb_path: null,
    notes: null,
    attendance_group_id: null,
    display_name: code,
    job_title: null,
    label: null,
    created_at: '2026-10-30T00:00:00Z',
  };
}

function record(employeeId: string, shift: 'morning' | 'afternoon', status: 'present' | 'late') {
  return {
    id: `${employeeId}-${shift}`,
    employee_id: employeeId,
    business_date: '2026-10-30',
    shift,
    status,
    notes: null,
    created_by: null,
    updated_by: null,
    created_at: '2026-10-30T00:00:00Z',
    updated_at: '2026-10-30T00:00:00Z',
  } satisfies AttendanceRow;
}

describe('attendance export filters', () => {
  it('requires a valid bounded date range and explicit office/factory location', () => {
    expect(
      parseAttendanceExportFilters(
        new URLSearchParams('from=2026-10-01&to=2026-10-30&location=office'),
      ),
    ).toEqual({ from: '2026-10-01', to: '2026-10-30', location: 'office' });
    expect(
      parseAttendanceExportFilters(new URLSearchParams('from=bad&to=2026-10-30&location=office')),
    ).toBeNull();
    expect(
      parseAttendanceExportFilters(
        new URLSearchParams('from=2026-10-31&to=2026-10-30&location=factory'),
      ),
    ).toBeNull();
    expect(
      parseAttendanceExportFilters(
        new URLSearchParams('from=2025-01-01&to=2026-10-30&location=factory'),
      ),
    ).toBeNull();
  });

  it('keeps locations separate and reports both shifts for every selected date', () => {
    const employees = [
      employee('office', 'ZY-0001', 'office'),
      employee('factory', 'ZY-0002', 'factory'),
      employee('fallback', 'ZY-0003', null),
      employee('archived', 'ZY-0004', 'office', false),
    ];
    const attendance = [
      record('office', 'morning', 'present'),
      record('office', 'afternoon', 'late'),
      record('factory', 'morning', 'late'),
    ];
    const groups: AttendanceGroupRow[] = [];

    const office = attendanceExportRows(employees, attendance, groups, {
      from: '2026-10-30',
      to: '2026-10-31',
      location: 'office',
    });
    const factory = attendanceExportRows(employees, attendance, groups, {
      from: '2026-10-30',
      to: '2026-10-30',
      location: 'factory',
    });

    expect(
      office.map((row) => [row.date, row.employeeCode, row.morningStatus, row.afternoonStatus]),
    ).toEqual([
      ['2026-10-30', 'ZY-0001', 'present', 'late'],
      ['2026-10-31', 'ZY-0001', 'unmarked', 'unmarked'],
    ]);
    expect(factory.map((row) => [row.employeeCode, row.morningStatus])).toEqual([
      ['ZY-0002', 'late'],
      ['ZY-0003', 'unmarked'],
    ]);
  });
});
