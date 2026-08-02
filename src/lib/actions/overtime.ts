'use server';
import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { assertPermission } from '@/lib/auth';
import { writeAudit } from '@/lib/audit';
import {
  overtimeEntrySchema,
  overtimeEntryUpdateSchema,
  overtimeSettingsSchema,
} from '@/lib/validation/schemas';
import { fail, ok, zodFieldErrors, type ActionState } from './types';

const OVERTIME_PATH = '/attendance/overtime';

function entryForm(formData: FormData) {
  return {
    businessDate: formData.get('businessDate'),
    employeeId: formData.get('employeeId'),
    description: formData.get('description'),
    timeRange: formData.get('timeRange'),
    tier1Hours: formData.get('tier1Hours'),
    tier2Hours: formData.get('tier2Hours'),
    notes: formData.get('notes'),
  };
}

/**
 * Record one overtime occasion. The amounts are NOT sent from the client —
 * they are GENERATED columns computed by Postgres from the hours × the rate
 * snapshot, so the 加班表 formula can never drift between UI and database.
 */
export async function createOvertimeEntry(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await assertPermission('overtime:manage');
  const parsed = overtimeEntrySchema.safeParse(entryForm(formData));
  if (!parsed.success)
    return fail('Please check the highlighted fields', zodFieldErrors(parsed.error.issues));
  const d = parsed.data;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('overtime_entries')
    .insert({
      business_date: d.businessDate,
      employee_id: d.employeeId,
      description: d.description ?? null,
      time_range: d.timeRange ?? null,
      tier1_hours: d.tier1Hours,
      tier2_hours: d.tier2Hours,
      notes: d.notes ?? null,
      created_by: user.id,
    })
    .select('id, total_amount')
    .single();
  if (error) return fail(error.message);

  await writeAudit(user, {
    action: 'overtime.create',
    entity: 'overtime_entries',
    entityId: data.id,
    newValue: {
      business_date: d.businessDate,
      tier1_hours: d.tier1Hours,
      tier2_hours: d.tier2Hours,
    },
  });
  revalidatePath(OVERTIME_PATH);
  return ok('Overtime recorded');
}

export async function updateOvertimeEntry(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await assertPermission('overtime:manage');
  const parsed = overtimeEntryUpdateSchema.safeParse({
    id: formData.get('id'),
    ...entryForm(formData),
  });
  if (!parsed.success)
    return fail('Please check the highlighted fields', zodFieldErrors(parsed.error.issues));
  const { id, ...d } = parsed.data;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('overtime_entries')
    .update({
      business_date: d.businessDate,
      employee_id: d.employeeId,
      description: d.description ?? null,
      time_range: d.timeRange ?? null,
      tier1_hours: d.tier1Hours,
      tier2_hours: d.tier2Hours,
      notes: d.notes ?? null,
    })
    .eq('id', id);
  if (error) return fail(error.message);

  await writeAudit(user, {
    action: 'overtime.update',
    entity: 'overtime_entries',
    entityId: id,
    newValue: { tier1_hours: d.tier1Hours, tier2_hours: d.tier2Hours },
  });
  revalidatePath(OVERTIME_PATH);
  return ok('Overtime updated');
}

export async function deleteOvertimeEntry(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await assertPermission('overtime:manage');
  const id = String(formData.get('id') ?? '');
  if (!id) return fail('Missing overtime entry');

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from('overtime_entries').delete().eq('id', id);
  if (error) return fail(error.message);

  await writeAudit(user, { action: 'overtime.delete', entity: 'overtime_entries', entityId: id });
  revalidatePath(OVERTIME_PATH);
  return ok('Overtime deleted');
}

/**
 * Update the tier rates. Existing entries keep their snapshotted rates, so
 * changing these never re-prices historical overtime. Audited old → new.
 */
export async function saveOvertimeSettings(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await assertPermission('settings:manage');
  const parsed = overtimeSettingsSchema.safeParse({
    tier1Label: formData.get('tier1Label'),
    tier1Rate: formData.get('tier1Rate'),
    tier2Label: formData.get('tier2Label'),
    tier2Rate: formData.get('tier2Rate'),
  });
  if (!parsed.success)
    return fail('Please check the highlighted fields', zodFieldErrors(parsed.error.issues));
  const d = parsed.data;

  const supabase = await createSupabaseServerClient();
  const { data: before } = await supabase
    .from('overtime_settings')
    .select('tier1_label, tier1_rate, tier2_label, tier2_rate')
    .eq('id', 1)
    .maybeSingle();

  const { error } = await supabase
    .from('overtime_settings')
    .update({
      tier1_label: d.tier1Label,
      tier1_rate: d.tier1Rate,
      tier2_label: d.tier2Label,
      tier2_rate: d.tier2Rate,
      updated_at: new Date().toISOString(),
    })
    .eq('id', 1);
  if (error) return fail(error.message);

  await writeAudit(user, {
    action: 'overtime.settings_update',
    entity: 'overtime_settings',
    entityId: '1',
    oldValue: before ?? null,
    newValue: {
      tier1_label: d.tier1Label,
      tier1_rate: d.tier1Rate,
      tier2_label: d.tier2Label,
      tier2_rate: d.tier2Rate,
    },
  });
  revalidatePath(OVERTIME_PATH);
  return ok('Overtime rates saved');
}
