import type { AttendanceStatus } from '@/lib/domain/attendance';
import { addDays } from '@/lib/domain/datetime';
import type { AttendanceLocation } from '@/lib/domain/report-schedule';
import type { AttendanceGroupRow, AttendanceRow, EmployeeRow } from '@/lib/db/types';

export interface AttendanceExportFilters {
  from: string;
  to: string;
  location: AttendanceLocation;
}

export interface AttendanceExportRow {
  date: string;
  employeeCode: string;
  employeeName: string;
  khmerName: string;
  groupName: string;
  jobTitle: string;
  morningStatus: AttendanceStatus;
  afternoonStatus: AttendanceStatus;
  notes: string;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function validDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  return new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

export function parseAttendanceExportFilters(
  params: URLSearchParams,
): AttendanceExportFilters | null {
  const from = params.get('from');
  const to = params.get('to');
  const location = params.get('location');
  if (!from || !to || !validDate(from) || !validDate(to) || from > to) return null;
  const days = Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 864e5,
  );
  if (days > 365 || (location !== 'office' && location !== 'factory')) return null;
  return { from, to, location };
}

function employeeLocation(employee: EmployeeRow): AttendanceLocation {
  return employee.work_location === 'office' ? 'office' : 'factory';
}

function datesInRange(from: string, to: string): string[] {
  const dates: string[] = [];
  for (let date = from; date <= to; date = addDays(date, 1)) dates.push(date);
  return dates;
}

/** Build one location/date-range report without mutating or duplicating attendance data. */
export function attendanceExportRows(
  employees: EmployeeRow[],
  attendance: AttendanceRow[],
  groups: AttendanceGroupRow[],
  filters: AttendanceExportFilters,
): AttendanceExportRow[] {
  const groupNames = new Map(groups.map((group) => [group.id, group.name]));
  const records = new Map(
    attendance
      .filter(
        (record) => record.business_date >= filters.from && record.business_date <= filters.to,
      )
      .map((record) => [`${record.business_date}:${record.employee_id}:${record.shift}`, record]),
  );
  const locationEmployees = employees.filter(
    (employee) => employee.is_active && employeeLocation(employee) === filters.location,
  );

  return datesInRange(filters.from, filters.to).flatMap((date) =>
    locationEmployees.map((employee) => {
      const morning = records.get(`${date}:${employee.id}:morning`);
      const afternoon = records.get(`${date}:${employee.id}:afternoon`);
      const notes = [
        morning?.notes ? `Morning: ${morning.notes}` : '',
        afternoon?.notes ? `Afternoon: ${afternoon.notes}` : '',
      ].filter(Boolean);
      return {
        date,
        employeeCode: employee.employee_code,
        employeeName:
          employee.display_name ||
          employee.name_english ||
          employee.name_chinese ||
          employee.employee_code,
        khmerName: employee.name_khmer ?? '',
        groupName: employee.attendance_group_id
          ? (groupNames.get(employee.attendance_group_id) ?? '')
          : '',
        jobTitle: employee.job_title || employee.position || '',
        morningStatus: morning?.status ?? 'unmarked',
        afternoonStatus: afternoon?.status ?? 'unmarked',
        notes: notes.join(' · '),
      };
    }),
  );
}
