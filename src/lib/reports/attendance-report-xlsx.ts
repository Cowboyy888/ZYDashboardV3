import { STATUS_LABELS } from '@/lib/domain/attendance';
import { ATTENDANCE_LOCATION_LABEL } from '@/lib/domain/report-schedule';
import { formatDDMMYYYY } from '@/lib/domain/datetime';
import { buildBrandedXlsx, type BrandedColumn } from './branded-xlsx';
import type { AttendanceExportFilters, AttendanceExportRow } from './attendance-export';

const COLUMNS: BrandedColumn<AttendanceExportRow>[] = [
  { header: 'Employee ID 员工编号', width: 16, value: (row) => row.employeeCode },
  { header: 'Employee 员工', width: 24, value: (row) => row.employeeName },
  { header: 'Khmer Name 高棉文姓名', width: 24, value: (row) => row.khmerName },
  { header: 'Group 分组', width: 20, value: (row) => row.groupName },
  { header: 'Position 职位', width: 20, value: (row) => row.jobTitle },
  {
    header: 'Status 状态',
    width: 16,
    value: (row) => `${STATUS_LABELS[row.status].en} ${STATUS_LABELS[row.status].zh}`,
  },
  { header: 'Notes 备注', width: 30, value: (row) => row.notes },
];

export async function buildAttendanceReportXlsx(
  rows: AttendanceExportRow[],
  filters: AttendanceExportFilters,
): Promise<Buffer> {
  const location = ATTENDANCE_LOCATION_LABEL[filters.location];
  const shift = filters.shift === 'morning' ? 'Morning 上午' : 'Afternoon 下午';
  const present = rows.filter((row) => row.status === 'present').length;
  const late = rows.filter((row) => row.status === 'late').length;
  const leave = rows.filter((row) => row.status === 'leave').length;
  const absent = rows.filter((row) => row.status === 'absent').length;
  const unmarked = rows.filter((row) => row.status === 'unmarked').length;

  return buildBrandedXlsx({
    sheetName: `${location.en} Attendance`,
    title: `${location.en.toUpperCase()} ATTENDANCE · ${location.zh}考勤表`,
    metaLeft: [
      { label: 'DATE 日期:', value: formatDDMMYYYY(filters.date) },
      { label: 'SHIFT 班次:', value: shift },
    ],
    metaRight: [
      { label: 'LOCATION 地点:', value: `${location.en} ${location.zh}` },
      { label: 'EMPLOYEES 员工:', value: String(rows.length) },
    ],
    columns: COLUMNS,
    rows,
    totals: [
      { label: 'Present 出勤:', value: present },
      { label: 'Late 迟到:', value: late },
      { label: 'Leave 请假:', value: leave },
      { label: 'Absent 缺勤:', value: absent },
      { label: 'Unmarked 未打卡:', value: unmarked, highlight: unmarked > 0 },
    ],
  });
}
