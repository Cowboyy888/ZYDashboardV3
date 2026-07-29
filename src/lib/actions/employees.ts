'use server';
import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { assertPermission } from '@/lib/auth';
import { writeAudit } from '@/lib/audit';
import {
  employeeSchema,
  employeeProfileSchema,
  employeeDetailsSchema,
} from '@/lib/validation/schemas';
import { businessDate } from '@/lib/domain/datetime';
import { fail, ok, zodFieldErrors, type ActionState } from './types';

export async function createEmployee(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await assertPermission('employees:manage');

  // Required: display name, attendance group, job title. Everything else is
  // optional. The Employee ID is NOT taken from the form — the DB generates it.
  const parsed = employeeSchema.safeParse({
    displayName: formData.get('displayName'),
    attendanceGroupId: formData.get('attendanceGroupId') || '',
    jobTitle: formData.get('jobTitle'),
    label: formData.get('label'),
    nameKhmer: formData.get('nameKhmer'),
    nameEnglish: formData.get('nameEnglish'),
    nameChinese: formData.get('nameChinese'),
    phone: formData.get('phone'),
    department: formData.get('department'),
    position: formData.get('position'),
    startDate: formData.get('startDate') || undefined,
    notes: formData.get('notes'),
  });
  if (!parsed.success) {
    return fail('Please check the highlighted fields', zodFieldErrors(parsed.error.issues));
  }
  const d = parsed.data;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('employees')
    .insert({
      // employee_code + seq_no are assigned atomically by the DB trigger.
      display_name: d.displayName,
      attendance_group_id: d.attendanceGroupId,
      job_title: d.jobTitle,
      label: d.label ?? null,
      name_khmer: d.nameKhmer ?? null,
      // The required "English name" field maps to display_name; mirror it into
      // name_english so the record's English name is populated too.
      name_english: d.nameEnglish ?? d.displayName,
      name_chinese: d.nameChinese ?? null,
      phone: d.phone ?? null,
      department: d.department ?? null,
      position: d.position ?? null,
      start_date: d.startDate ?? businessDate(), // default to today
      // pay_type has only ever been 'daily' since migration 0016; the column
      // still defaults to it, so it is not set explicitly here.
      notes: d.notes ?? null,
      is_active: true,
    })
    .select('id, employee_code')
    .single();
  if (error) return fail(error.message);

  await writeAudit(user, {
    action: 'employee.create',
    entity: 'employees',
    entityId: data.id,
    newValue: { employeeCode: data.employee_code, displayName: d.displayName },
  });
  revalidatePath('/employees');
  return ok(`Employee ${data.employee_code} created`, {
    employeeId: data.id,
    employeeCode: data.employee_code,
  });
}

export async function toggleEmployee(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await assertPermission('employees:manage');
  const id = String(formData.get('id') ?? '');
  const isActive = String(formData.get('isActive')) === 'true';
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from('employees').update({ is_active: !isActive }).eq('id', id);
  if (error) return fail(error.message);
  await writeAudit(user, {
    action: isActive ? 'employee.deactivate' : 'employee.activate',
    entity: 'employees',
    entityId: id,
  });
  revalidatePath('/employees');
  revalidatePath(`/employees/${id}`);
  return ok('Employee updated');
}

export async function saveEmployeePrivate(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await assertPermission('employee_sensitive:view');
  const employeeId = String(formData.get('employeeId') ?? '');
  const dailyRate = formData.get('dailyRate');
  const emergencyContact = formData.get('emergencyContact');

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from('employee_private').upsert({
    employee_id: employeeId,
    daily_rate: dailyRate ? Number(dailyRate) : null,
    emergency_contact: emergencyContact ? String(emergencyContact) : null,
  });
  if (error) return fail(error.message);
  await writeAudit(user, {
    action: 'employee.pay_update',
    entity: 'employee_private',
    entityId: employeeId,
    newValue: { updated: true }, // never log actual salary
  });
  revalidatePath(`/employees/${employeeId}`);
  return ok('Payroll details saved');
}

export async function setEmployeePhoto(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await assertPermission('employees:manage');
  const employeeId = String(formData.get('employeeId') ?? '');
  const path = String(formData.get('path') ?? '');
  if (!employeeId || !path) return fail('Missing photo path');
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('employees')
    .update({ photo_path: path })
    .eq('id', employeeId);
  if (error) return fail(error.message);
  await writeAudit(user, {
    action: 'employee.photo_update',
    entity: 'employees',
    entityId: employeeId,
  });
  revalidatePath(`/employees/${employeeId}`);
  return ok('Photo updated');
}

/** Update an employee's attendance-group profile fields (used by the report). */
export async function updateEmployeeProfile(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await assertPermission('employees:manage');
  const employeeId = String(formData.get('employeeId') ?? '');
  if (!employeeId) return fail('Missing employee');
  const parsed = employeeProfileSchema.safeParse({
    attendanceGroupId: formData.get('attendanceGroupId') || undefined,
    displayName: formData.get('displayName'),
    jobTitle: formData.get('jobTitle'),
    label: formData.get('label'),
  });
  if (!parsed.success) return fail('Validation failed', zodFieldErrors(parsed.error.issues));
  const d = parsed.data;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('employees')
    .update({
      attendance_group_id: d.attendanceGroupId ?? null,
      display_name: d.displayName ?? null,
      job_title: d.jobTitle ?? null,
      label: d.label ?? null,
    })
    .eq('id', employeeId);
  if (error) return fail(error.message);

  await writeAudit(user, {
    action: 'employee.profile_update',
    entity: 'employees',
    entityId: employeeId,
    newValue: d,
  });
  revalidatePath('/employees');
  revalidatePath(`/employees/${employeeId}`);
  return ok('Profile updated');
}

/** Update an employee's core HR details (name variants, phone, department, start date, pay type, notes). */
export async function updateEmployeeDetails(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await assertPermission('employees:manage');
  const employeeId = String(formData.get('employeeId') ?? '');
  if (!employeeId) return fail('Missing employee');
  const parsed = employeeDetailsSchema.safeParse({
    nameKhmer: formData.get('nameKhmer'),
    nameChinese: formData.get('nameChinese'),
    phone: formData.get('phone'),
    department: formData.get('department'),
    startDate: formData.get('startDate') || undefined,
    notes: formData.get('notes'),
  });
  if (!parsed.success) return fail('Validation failed', zodFieldErrors(parsed.error.issues));
  const d = parsed.data;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('employees')
    .update({
      name_khmer: d.nameKhmer ?? null,
      name_chinese: d.nameChinese ?? null,
      phone: d.phone ?? null,
      department: d.department ?? null,
      start_date: d.startDate ?? null,
      notes: d.notes ?? null,
    })
    .eq('id', employeeId);
  if (error) return fail(error.message);

  await writeAudit(user, {
    action: 'employee.details_update',
    entity: 'employees',
    entityId: employeeId,
    newValue: d,
  });
  revalidatePath('/employees');
  revalidatePath(`/employees/${employeeId}`);
  return ok('Details updated');
}
