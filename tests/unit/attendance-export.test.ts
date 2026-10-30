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
  it('requires a valid date, shift and explicit office/factory location', () => {
    expect(
      parseAttendanceExportFilters(
        new URLSearchParams('date=2026-10-30&shift=morning&location=office'),
      ),
    ).toEqual({ date: '2026-10-30', shift: 'morning', location: 'office' });
    expect(parseAttendanceExportFilters(new URLSearchParams('date=bad&shift=morning'))).toBeNull();
    expect(
      parseAttendanceExportFilters(
        new URLSearchParams('date=2026-10-30&shift=night&location=factory'),
      ),
    ).toBeNull();
  });

  it('keeps Office and Factory separate and reports only the selected shift', () => {
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
      date: '2026-10-30',
      shift: 'morning',
      location: 'office',
    });
    const factory = attendanceExportRows(employees, attendance, groups, {
      date: '2026-10-30',
      shift: 'morning',
      location: 'factory',
    });

    expect(office.map((row) => [row.employeeCode, row.status])).toEqual([['ZY-0001', 'present']]);
    expect(factory.map((row) => [row.employeeCode, row.status])).toEqual([
      ['ZY-0002', 'late'],
      ['ZY-0003', 'unmarked'],
    ]);
  });
});
