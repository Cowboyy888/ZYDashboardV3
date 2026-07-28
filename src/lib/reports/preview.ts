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
        'id, attendance_group_id, employee_number, display_name, name_english, name_khmer, name_chinese, job_title, label',
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
      (e.employee_number as string | null) ||
      (e.id as string),
    employeeNumber: (e.employee_number as string | null) ?? null,
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
