'use server';
import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { assertPermission } from '@/lib/auth';
import { writeAudit } from '@/lib/audit';
import { createPayrollRunSchema, addPayrollLineSchema } from '@/lib/validation/schemas';
import { canApproveRun, canMarkPaid, canCancelRun, type PayrollStatus } from '@/lib/domain/payroll';
import { fail, ok, zodFieldErrors, type ActionState } from './types';

// --- Payroll runs ------------------------------------------------------------------
// NOTE: audit entries in this file NEVER include salary/pay figures (base
// amount, rate, deduction/advance amounts, net pay) — only metadata (period
// dates, status transitions, counts, labels/kinds). See AGENTS.md §"never log
// salary values" and the existing precedent in actions/employees.ts's
// saveEmployeePrivate (`newValue: { updated: true }`).

export async function createDraftPayrollRun(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await assertPermission('payroll:manage');
  const parsed = createPayrollRunSchema.safeParse({
    periodStart: formData.get('periodStart'),
    periodEnd: formData.get('periodEnd'),
    payDate: formData.get('payDate'),
    notes: formData.get('notes'),
  });
  if (!parsed.success)
    return fail('Please check the highlighted fields', zodFieldErrors(parsed.error.issues));
  const d = parsed.data;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('create_draft_payroll_run', {
    p_period_start: d.periodStart,
    p_period_end: d.periodEnd,
    p_pay_date: d.payDate,
    p_notes: d.notes ?? null,
  });
  if (error) return fail(error.message);

  const runId = String(data ?? '');
  await writeAudit(user, {
    action: 'payroll_run.create',
    entity: 'payroll_runs',
    entityId: runId,
    newValue: { periodStart: d.periodStart, periodEnd: d.periodEnd, payDate: d.payDate },
  });
  revalidatePath('/payroll');
  return ok('Payroll run generated as Draft', { id: runId });
}

async function transitionRun(
  id: string,
  permission: Parameters<typeof assertPermission>[0],
  guard: (status: PayrollStatus) => boolean,
  guardMessage: string,
  patch: Record<string, unknown>,
  action: string,
  successMessage: string,
): Promise<ActionState> {
  const user = await assertPermission(permission);
  if (!id) return fail('Missing payroll run');

  const supabase = await createSupabaseServerClient();
  const { data: run } = await supabase
    .from('payroll_runs')
    .select('status')
    .eq('id', id)
    .maybeSingle();
  if (!run) return fail('Payroll run not found');
  if (!guard(run.status as PayrollStatus)) return fail(guardMessage);

  const { error } = await supabase.from('payroll_runs').update(patch).eq('id', id);
  if (error) {
    if (error.message.includes('PAYROLL_APPROVE_OWNER_ONLY'))
      return fail('Only an Owner may approve a payroll run.');
    return fail(error.message);
  }

  await writeAudit(user, {
    action,
    entity: 'payroll_runs',
    entityId: id,
    oldValue: { status: run.status },
    newValue: { status: patch.status },
  });
  revalidatePath(`/payroll/${id}`);
  revalidatePath('/payroll');
  return ok(successMessage);
}

export async function approvePayrollRun(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return transitionRun(
    String(formData.get('id') ?? ''),
    'payroll:approve',
    canApproveRun,
    'Only a Draft payroll run can be approved.',
    { status: 'approved', approved_at: new Date().toISOString() },
    'payroll_run.approve',
    'Payroll run approved',
  );
}

export async function markPayrollRunPaid(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return transitionRun(
    String(formData.get('id') ?? ''),
    'payroll:manage',
    canMarkPaid,
    'Only an Approved payroll run can be marked Paid.',
    { status: 'paid', paid_at: new Date().toISOString() },
    'payroll_run.pay',
    'Payroll run marked Paid',
  );
}

export async function cancelPayrollRun(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return transitionRun(
    String(formData.get('id') ?? ''),
    'payroll:manage',
    canCancelRun,
    'This payroll run cannot be cancelled in its current status.',
    { status: 'cancelled', cancelled_at: new Date().toISOString() },
    'payroll_run.cancel',
    'Payroll run cancelled',
  );
}

// --- Deduction / advance lines -----------------------------------------------------

export async function addPayrollLine(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await assertPermission('payroll:manage');
  const parsed = addPayrollLineSchema.safeParse({
    itemId: formData.get('itemId'),
    kind: formData.get('kind'),
    label: formData.get('label'),
    amount: formData.get('amount'),
  });
  if (!parsed.success)
    return fail('Please check the highlighted fields', zodFieldErrors(parsed.error.issues));
  const d = parsed.data;

  const supabase = await createSupabaseServerClient();
  const { data: item } = await supabase
    .from('payroll_items')
    .select('id, payroll_run_id')
    .eq('id', d.itemId)
    .maybeSingle();
  if (!item) return fail('Payroll item not found');

  const { error } = await supabase.from('payroll_item_lines').insert({
    payroll_item_id: d.itemId,
    kind: d.kind,
    label: d.label,
    amount: d.amount,
  });
  if (error) {
    if (error.message.includes('PAYROLL_LINE_LOCKED'))
      return fail('This payroll run is no longer a Draft — lines can no longer be changed.');
    return fail(error.message);
  }

  await writeAudit(user, {
    action: 'payroll_item.add_line',
    entity: 'payroll_item_lines',
    entityId: d.itemId,
    newValue: { kind: d.kind, label: d.label }, // never log the amount
  });
  revalidatePath(`/payroll/${item.payroll_run_id}`);
  return ok('Line added');
}

export async function removePayrollLine(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await assertPermission('payroll:manage');
  const lineId = String(formData.get('lineId') ?? '');
  const runId = String(formData.get('runId') ?? '');
  if (!lineId) return fail('Missing line');

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from('payroll_item_lines').delete().eq('id', lineId);
  if (error) {
    if (error.message.includes('PAYROLL_LINE_LOCKED'))
      return fail('This payroll run is no longer a Draft — lines can no longer be changed.');
    return fail(error.message);
  }

  await writeAudit(user, {
    action: 'payroll_item.remove_line',
    entity: 'payroll_item_lines',
    entityId: lineId,
  });
  if (runId) revalidatePath(`/payroll/${runId}`);
  return ok('Line removed');
}
