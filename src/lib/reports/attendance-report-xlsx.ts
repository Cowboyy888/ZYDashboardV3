import { STATUS_LABELS } from '@/lib/domain/attendance';
import { ATTENDANCE_LOCATION_LABEL } from '@/lib/domain/report-schedule';
import { formatDDMMYYYY } from '@/lib/domain/datetime';
import { buildBrandedXlsx, type BrandedColumn } from './branded-xlsx';
import type { AttendanceExportFilters, AttendanceExportRow } from './attendance-export';

const COLUMNS: BrandedColumn<AttendanceExportRow>[] = [
  { header: 'Date 日期', width: 14, value: (row) => formatDDMMYYYY(row.date) },
  { header: 'Employee ID 员工编号', width: 16, value: (row) => row.employeeCode },
  { header: 'Employee 员工', width: 24, value: (row) => row.employeeName },
  { header: 'Khmer Name 高棉文姓名', width: 24, value: (row) => row.khmerName },
  { header: 'Group 分组', width: 20, value: (row) => row.groupName },
  { header: 'Position 职位', width: 20, value: (row) => row.jobTitle },
  {
    header: 'Morning 上午',
    width: 16,
    value: (row) => `${STATUS_LABELS[row.morningStatus].en} ${STATUS_LABELS[row.morningStatus].zh}`,
  },
  {
    header: 'Afternoon 下午',
    width: 16,
    value: (row) =>
      `${STATUS_LABELS[row.afternoonStatus].en} ${STATUS_LABELS[row.afternoonStatus].zh}`,
  },
  { header: 'Notes 备注', width: 30, value: (row) => row.notes || null },
];

export async function buildAttendanceReportXlsx(
  rows: AttendanceExportRow[],
  filters: AttendanceExportFilters,
): Promise<Buffer> {
  const location = ATTENDANCE_LOCATION_LABEL[filters.location];
  const statuses = rows.flatMap((row) => [row.morningStatus, row.afternoonStatus]);
  const count = (status: (typeof statuses)[number]) =>
    statuses.filter((item) => item === status).length;
  const employeeCount = new Set(rows.map((row) => row.employeeCode)).size;
  const dayCount = new Set(rows.map((row) => row.date)).size;

  return buildBrandedXlsx({
    sheetName: `${location.en} Attendance`,
    title: `${location.en.toUpperCase()} ATTENDANCE · ${location.zh}考勤表`,
    metaLeft: [
      {
        label: 'PERIOD 日期范围:',
        value: `${formatDDMMYYYY(filters.from)} — ${formatDDMMYYYY(filters.to)}`,
      },
      { label: 'SHIFTS 班次:', value: 'Morning 上午 · Afternoon 下午' },
    ],
    metaRight: [
      { label: 'LOCATION 地点:', value: `${location.en} ${location.zh}` },
      { label: 'EMPLOYEES 员工:', value: String(employeeCount) },
      { label: 'DAYS 天数:', value: String(dayCount) },
    ],
    columns: COLUMNS,
    rows,
    totals: [
      { label: 'Present 出勤:', value: count('present') },
      { label: 'Late 迟到:', value: count('late') },
      { label: 'Leave 请假:', value: count('leave') },
      { label: 'Absent 缺勤:', value: count('absent') },
      { label: 'Unmarked 未打卡:', value: count('unmarked'), highlight: count('unmarked') > 0 },
    ],
    includeLogo: true,
  });
}
