'use server';
import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { assertPermission } from '@/lib/auth';
import { writeAudit } from '@/lib/audit';
import { attendanceEntrySchema, bulkAttendanceSchema } from '@/lib/validation/schemas';
import { fail, ok, zodFieldErrors, type ActionState } from './types';

/** Set (or correct) one employee's status for a shift. */
export async function markAttendance(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await assertPermission('attendance:manage');
  const parsed = attendanceEntrySchema.safeParse({
    employeeId: formData.get('employeeId'),
    businessDate: formData.get('businessDate'),
    shift: formData.get('shift'),
    status: formData.get('status'),
    notes: formData.get('notes'),
  });
  if (!parsed.success) return fail('Validation failed', zodFieldErrors(parsed.error.issues));
  const d = parsed.data;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from('attendance').upsert(
    {
      employee_id: d.employeeId,
      business_date: d.businessDate,
      shift: d.shift,
      status: d.status,
      notes: d.notes ?? null,
      created_by: user.id,
      updated_by: user.id,
    },
    { onConflict: 'employee_id,business_date,shift' },
  );
  if (error) return fail(error.message);

  await writeAudit(user, {
    action: 'attendance.mark',
    entity: 'attendance',
    entityId: `${d.employeeId}:${d.businessDate}:${d.shift}`,
    newValue: { status: d.status },
  });
  revalidatePath('/attendance');
  return ok('Saved');
}

/** Bulk mark every active employee Present for a shift (edit exceptions after). */
export async function bulkMarkPresent(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await assertPermission('attendance:manage');
  const parsed = bulkAttendanceSchema.safeParse({
    businessDate: formData.get('businessDate'),
    shift: formData.get('shift'),
    employeeIds: formData.getAll('employeeIds'),
    status: 'present',
  });
  if (!parsed.success) return fail('Validation failed', zodFieldErrors(parsed.error.issues));
  const d = parsed.data;

  const rows = d.employeeIds.map((employee_id) => ({
    employee_id,
    business_date: d.businessDate,
    shift: d.shift,
    status: 'present' as const,
    created_by: user.id,
    updated_by: user.id,
  }));

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('attendance')
    .upsert(rows, { onConflict: 'employee_id,business_date,shift' });
  if (error) return fail(error.message);

  await writeAudit(user, {
    action: 'attendance.bulk_present',
    entity: 'attendance',
    entityId: `${d.businessDate}:${d.shift}`,
    newValue: { count: rows.length },
  });
  revalidatePath('/attendance');
  return ok(`Marked ${rows.length} present`);
}
