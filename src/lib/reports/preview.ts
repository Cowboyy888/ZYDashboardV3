import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import {
  buildGroupedAttendanceReport,
  type GroupedAttendanceReport,
  type ReportAttendance,
  type ReportEmployee,
  type ReportGroup,
} from '@/lib/domain/attendance-report';
import type { Shift } from '@/lib/domain/attendance';
import {
  ATTENDANCE_LOCATIONS,
  ATTENDANCE_LOCATION_LABEL,
  type AttendanceLocation,
} from '@/lib/domain/report-schedule';
import { renderInventoryReport, type InventoryReportRow } from '@/lib/domain/reports';
import { buildInventoryRows } from '@/lib/domain/inventory-view';
import type { SkuRow } from '@/lib/db/types';

/** Which location bucket an employee's work_location falls into for report
 * routing. A missing/unexpected value falls back to Factory — see the same
 * fallback in reports/service.ts. */
function bucketFor(workLocation: string | null): AttendanceLocation {
  return workLocation === 'office' ? 'office' : 'factory';
}

/**
 * Build the grouped attendance report for a date + shift from LIVE records,
 * split by employees.work_location, using the request-scoped (RLS-respecting)
 * client. Used by the visible Report Preview page — the exact same builder
 * (and the same Office/Factory split) the Telegram jobs use, so the preview
 * matches what is actually sent.
 */
export async function buildAttendancePreview(
  date: string,
  shift: Shift,
): Promise<Record<AttendanceLocation, GroupedAttendanceReport>> {
  const supabase = await createSupabaseServerClient();
  const [{ data: groups }, { data: employees }, { data: attendance }] = await Promise.all([
    supabase
      .from('attendance_groups')
      .select('id, name, sort_order')
      .eq('is_active', true)
      .order('sort_order')
      .order('name'),
    supabase
      .from('employees')
      .select(
        'id, attendance_group_id, display_name, name_english, name_khmer, name_chinese, job_title, label, work_location',
      )
      .eq('is_active', true),
    supabase
      .from('attendance')
      .select('employee_id, business_date, shift, status')
      .eq('business_date', date)
      .eq('shift', shift),
  ]);

  const reportGroups: ReportGroup[] = (groups ?? []).map((g) => ({
    id: g.id as string,
    name: g.name as string,
  }));

  const employeesByLocation: Record<AttendanceLocation, ReportEmployee[]> = {
    office: [],
    factory: [],
  };
  for (const e of employees ?? []) {
    const reportEmployee: ReportEmployee = {
      id: e.id as string,
      groupId: (e.attendance_group_id as string | null) ?? null,
      displayName:
        (e.display_name as string | null) ||
        (e.name_english as string | null) ||
        (e.name_khmer as string | null) ||
        (e.name_chinese as string | null) ||
        (e.id as string),
      jobTitle: (e.job_title as string | null) ?? null,
      label: (e.label as string | null) ?? null,
    };
    employeesByLocation[bucketFor(e.work_location as string | null)].push(reportEmployee);
  }

  const records: ReportAttendance[] = (attendance ?? []).map((a) => ({
    employeeId: a.employee_id as string,
    status: a.status,
  }));

  const result = {} as Record<AttendanceLocation, GroupedAttendanceReport>;
  for (const location of ATTENDANCE_LOCATIONS) {
    result[location] = buildGroupedAttendanceReport({
      date,
      shift,
      groups: reportGroups,
      employees: employeesByLocation[location],
      records,
      locationLabel: `${ATTENDANCE_LOCATION_LABEL[location].zh} ${ATTENDANCE_LOCATION_LABEL[location].en}`,
    });
  }
  return result;
}

/**
 * Build the inventory report body for a date from LIVE records, using the
 * request-scoped (RLS-respecting) client. Mirrors `buildReportText`'s
 * inventory branch in reports/service.ts (which uses the admin client for
 * scheduled/manual sends) so the preview matches exactly what is sent.
 */
export async function buildInventoryPreview(date: string): Promise<string> {
  const supabase = await createSupabaseServerClient();
  const [{ data: skus }, { data: families }, { data: locations }, { data: balances }] =
    await Promise.all([
      supabase.from('skus').select('*').eq('is_active', true),
      supabase.from('product_families').select('*'),
      supabase.from('locations').select('*'),
      supabase.from('stock_balances').select('*'),
    ]);

  const rows = buildInventoryRows(skus ?? [], families ?? [], locations ?? [], balances ?? []);
  const skuById = new Map(((skus ?? []) as SkuRow[]).map((s) => [s.id, s]));
  const reportRows: InventoryReportRow[] = rows
    .filter((r) => r.total > 0 || r.isLow)
    .map((r) => {
      const sku = skuById.get(r.skuId);
      return {
        skuLabel: r.label,
        familyName: r.familyName,
        condition: r.condition,
        unit: r.unit,
        storageRoom: r.storageRoom,
        warehouse: r.warehouse,
        total: r.total,
        minimumLevel: r.minimumLevel,
        isLow: r.isLow,
        diameter: sku?.diameter ?? null,
        size: sku?.size ?? null,
        hole: sku?.hole ?? null,
        rodCount: sku?.rod_count ?? null,
        extra: sku?.extra ?? null,
        specType: r.specType,
      };
    });

  return renderInventoryReport(reportRows, { businessDate: date });
}
