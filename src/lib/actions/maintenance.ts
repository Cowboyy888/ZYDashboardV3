'use server';
import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { assertPermission } from '@/lib/auth';
import { writeAudit } from '@/lib/audit';
import { businessDate } from '@/lib/domain/datetime';
import { equipmentMaintenanceSchema } from '@/lib/validation/schemas';
import { fail, ok, zodFieldErrors, type ActionState } from './types';

const LIST_PATH = '/maintenance';

function maintenanceForm(formData: FormData) {
  return {
    machineName: formData.get('machineName'),
    performedOn: formData.get('performedOn') || businessDate(),
    technicianId: formData.get('technicianId'),
    nextDueDate: formData.get('nextDueDate'),
    notes: formData.get('notes'),
  };
}

export async function createMaintenanceRecord(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await assertPermission('maintenance:manage');
  const parsed = equipmentMaintenanceSchema.safeParse(maintenanceForm(formData));
  if (!parsed.success)
    return fail('Please check the highlighted fields', zodFieldErrors(parsed.error.issues));
  const d = parsed.data;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('equipment_maintenance')
    .insert({
      machine_name: d.machineName,
      performed_on: d.performedOn,
      technician_id: d.technicianId ?? null,
      next_due_date: d.nextDueDate ?? null,
      notes: d.notes ?? null,
      created_by: user.id,
    })
    .select('id')
    .single();
  if (error) return fail(error.message);

  await writeAudit(user, {
    action: 'maintenance.create',
    entity: 'equipment_maintenance',
    entityId: data.id,
    newValue: { machineName: d.machineName, performedOn: d.performedOn },
  });
  revalidatePath(LIST_PATH);
  return ok('Maintenance record added');
}

export async function updateMaintenanceRecord(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await assertPermission('maintenance:manage');
  const id = String(formData.get('id') ?? '');
  if (!id) return fail('Missing maintenance record');
  const parsed = equipmentMaintenanceSchema.safeParse(maintenanceForm(formData));
  if (!parsed.success)
    return fail('Please check the highlighted fields', zodFieldErrors(parsed.error.issues));
  const d = parsed.data;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('equipment_maintenance')
    .update({
      machine_name: d.machineName,
      performed_on: d.performedOn,
      technician_id: d.technicianId ?? null,
      next_due_date: d.nextDueDate ?? null,
      notes: d.notes ?? null,
    })
    .eq('id', id);
  if (error) return fail(error.message);

  await writeAudit(user, {
    action: 'maintenance.update',
    entity: 'equipment_maintenance',
    entityId: id,
    newValue: { machineName: d.machineName, performedOn: d.performedOn },
  });
  revalidatePath(LIST_PATH);
  return ok('Maintenance record updated');
}

export async function deleteMaintenanceRecord(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await assertPermission('maintenance:manage');
  const id = String(formData.get('id') ?? '');
  if (!id) return fail('Missing maintenance record');

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from('equipment_maintenance').delete().eq('id', id);
  if (error) return fail(error.message);

  await writeAudit(user, {
    action: 'maintenance.delete',
    entity: 'equipment_maintenance',
    entityId: id,
  });
  revalidatePath(LIST_PATH);
  return ok('Maintenance record deleted');
}
