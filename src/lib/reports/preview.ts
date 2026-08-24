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
import { renderInventoryReport, type InventoryReportRow } from '@/lib/domain/reports';
import { buildInventoryRows } from '@/lib/domain/inventory-view';
import type { SkuRow } from '@/lib/db/types';

/**
 * Build the grouped attendance report for a date + shift from LIVE records,
 * using the request-scoped (RLS-respecting) client. Used by the visible Report
 * Preview page — the exact same builder the Telegram jobs use, so the preview
 * matches what is sent.
 */
export async function buildAttendancePreview(
  date: string,
  shift: Shift,
): Promise<GroupedAttendanceReport> {
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
        'id, attendance_group_id, display_name, name_english, name_khmer, name_chinese, job_title, label',
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
  const reportEmployees: ReportEmployee[] = (employees ?? []).map((e) => ({
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
  }));
  const records: ReportAttendance[] = (attendance ?? []).map((a) => ({
    employeeId: a.employee_id as string,
    status: a.status,
  }));

  return buildGroupedAttendanceReport({
    date,
    shift,
    groups: reportGroups,
    employees: reportEmployees,
    records,
  });
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
