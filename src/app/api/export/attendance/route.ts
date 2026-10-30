import { requirePermission } from '@/lib/auth';
import { getAttendanceForRange, getAttendanceGroups, getEmployees } from '@/lib/db/queries';
import {
  attendanceExportRows,
  parseAttendanceExportFilters,
} from '@/lib/reports/attendance-export';
import { buildAttendanceReportXlsx } from '@/lib/reports/attendance-report-xlsx';
import { xlsxResponse } from '@/lib/reports/xlsx';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  await requirePermission('attendance:view');
  const filters = parseAttendanceExportFilters(new URL(request.url).searchParams);
  if (!filters) return new Response('Invalid attendance report filters', { status: 400 });

  const [employees, attendance, groups] = await Promise.all([
    getEmployees(),
    getAttendanceForRange(filters.from, filters.to),
    getAttendanceGroups(true),
  ]);
  const rows = attendanceExportRows(employees, attendance, groups, filters);
  const buffer = await buildAttendanceReportXlsx(rows, filters);
  return xlsxResponse(
    buffer,
    `attendance-${filters.location}-${filters.from}-to-${filters.to}.xlsx`,
  );
}
