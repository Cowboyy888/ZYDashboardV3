'use server';
import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { assertPermission } from '@/lib/auth';
import { writeAudit } from '@/lib/audit';
import { createSalesTargetSchema, saveKpiScorecardSchema } from '@/lib/validation/schemas';
import { fail, ok, zodFieldErrors, type ActionState } from './types';

const TARGETS_PATH = '/sales/targets';
const KPI_PATH = '/sales/kpi';

/**
 * One target per (employee, period) — upsert on that unique key so the same
 * form serves both create and edit with no separate "update" action or id
 * field to thread through.
 */
export async function createOrUpdateSalesTarget(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await assertPermission('sales_targets:manage');
  const parsed = createSalesTargetSchema.safeParse({
    employeeId: formData.get('employeeId'),
    period: formData.get('period'),
    revenueTarget: formData.get('revenueTarget'),
    targetMarginPct: formData.get('targetMarginPct'),
    ordersTarget: formData.get('ordersTarget'),
    newCustomers: formData.get('newCustomers'),
    quotationsWeek: formData.get('quotationsWeek'),
    qualifiedWeek: formData.get('qualifiedWeek'),
    contactsDay: formData.get('contactsDay'),
    visitsDay: formData.get('visitsDay'),
    leadsDay: formData.get('leadsDay'),
    notes: formData.get('notes'),
  });
  if (!parsed.success)
    return fail('Please check the highlighted fields', zodFieldErrors(parsed.error.issues));
  const d = parsed.data;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('sales_targets')
    .upsert(
      {
        employee_id: d.employeeId,
        period: d.period,
        revenue_target: d.revenueTarget,
        target_margin_pct: d.targetMarginPct,
        orders_target: d.ordersTarget,
        new_customers: d.newCustomers,
        quotations_week: d.quotationsWeek,
        qualified_week: d.qualifiedWeek,
        contacts_day: d.contactsDay,
        visits_day: d.visitsDay,
        leads_day: d.leadsDay,
        notes: d.notes ?? null,
        created_by: user.id,
      },
      { onConflict: 'employee_id,period' },
    )
    .select('id')
    .single();
  if (error) return fail(error.message);

  await writeAudit(user, {
    action: 'sales_target.save',
    entity: 'sales_targets',
    entityId: data.id as string,
    newValue: { employeeId: d.employeeId, period: d.period },
  });
  revalidatePath(TARGETS_PATH);
  return ok('Sales target saved', { id: data.id as string });
}

/** Parse the repeated KPI line fields the scorecard editor submits. */
function parseKpiLines(formData: FormData): unknown[] {
  const labels = formData.getAll('lineLabel');
  const weights = formData.getAll('lineWeight');
  const targets = formData.getAll('lineTarget');
  const actuals = formData.getAll('lineActual');
  const lowerIsBetter = formData.getAll('lineLowerIsBetter');
  return labels.map((label, i) => ({
    label,
    weight: weights[i],
    targetValue: targets[i],
    actualValue: actuals[i],
    lowerIsBetter: lowerIsBetter[i],
  }));
}

/**
 * One scorecard per (employee, period) — upsert the header, then replace its
 * lines wholesale (same "delete then insert" approach as quotation items in
 * actions/quotations.ts — the simplest correct behaviour; the Supabase client
 * has no cross-statement transaction here, only per-statement atomicity).
 */
export async function saveKpiScorecard(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await assertPermission('kpi:manage');
  const parsed = saveKpiScorecardSchema.safeParse({
    employeeId: formData.get('employeeId'),
    period: formData.get('period'),
    notes: formData.get('notes'),
    lines: parseKpiLines(formData),
  });
  if (!parsed.success)
    return fail('Please check the highlighted fields', zodFieldErrors(parsed.error.issues));
  const d = parsed.data;

  const supabase = await createSupabaseServerClient();
  const { data: card, error } = await supabase
    .from('kpi_scorecards')
    .upsert(
      { employee_id: d.employeeId, period: d.period, notes: d.notes ?? null, created_by: user.id },
      { onConflict: 'employee_id,period' },
    )
    .select('id')
    .single();
  if (error) return fail(error.message);
  const scorecardId = card.id as string;

  await supabase.from('kpi_scorecard_lines').delete().eq('scorecard_id', scorecardId);
  const { error: linesError } = await supabase.from('kpi_scorecard_lines').insert(
    d.lines.map((l, idx) => ({
      scorecard_id: scorecardId,
      line_no: idx + 1,
      label: l.label,
      weight: l.weight,
      target_value: l.targetValue ?? null,
      actual_value: l.actualValue ?? null,
      lower_is_better: l.lowerIsBetter,
    })),
  );
  if (linesError) return fail(linesError.message);

  await writeAudit(user, {
    action: 'kpi_scorecard.save',
    entity: 'kpi_scorecards',
    entityId: scorecardId,
    newValue: { employeeId: d.employeeId, period: d.period, lines: d.lines.length },
  });
  revalidatePath(KPI_PATH);
  return ok('KPI scorecard saved', { id: scorecardId });
}
