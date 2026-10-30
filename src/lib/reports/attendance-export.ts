import type { AttendanceStatus, Shift } from '@/lib/domain/attendance';
import type { AttendanceLocation } from '@/lib/domain/report-schedule';
import type { AttendanceGroupRow, AttendanceRow, EmployeeRow } from '@/lib/db/types';

export interface AttendanceExportFilters {
  date: string;
  shift: Shift;
  location: AttendanceLocation;
}

export interface AttendanceExportRow {
  employeeCode: string;
  employeeName: string;
  khmerName: string;
  groupName: string;
  jobTitle: string;
  status: AttendanceStatus;
  notes: string;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function parseAttendanceExportFilters(
  params: URLSearchParams,
): AttendanceExportFilters | null {
  const date = params.get('date');
  const shift = params.get('shift');
  const location = params.get('location');
  if (
    !date ||
    !ISO_DATE.test(date) ||
    (shift !== 'morning' && shift !== 'afternoon') ||
    (location !== 'office' && location !== 'factory')
  ) {
    return null;
  }
  return { date, shift, location };
}

function employeeLocation(employee: EmployeeRow): AttendanceLocation {
  return employee.work_location === 'office' ? 'office' : 'factory';
}

/** Build one location/shift report without mutating or duplicating attendance data. */
export function attendanceExportRows(
  employees: EmployeeRow[],
  attendance: AttendanceRow[],
  groups: AttendanceGroupRow[],
  filters: AttendanceExportFilters,
): AttendanceExportRow[] {
  const groupNames = new Map(groups.map((group) => [group.id, group.name]));
  const recordByEmployee = new Map(
    attendance
      .filter((record) => record.business_date === filters.date && record.shift === filters.shift)
      .map((record) => [record.employee_id, record]),
  );

  return employees
    .filter((employee) => employee.is_active && employeeLocation(employee) === filters.location)
    .map((employee) => {
      const record = recordByEmployee.get(employee.id);
      return {
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
        status: record?.status ?? 'unmarked',
        notes: record?.notes ?? '',
      };
    });
}
