'use server';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { assertPermission } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { productionOrderSchema, productionTransitionSchema } from '@/lib/validation/schemas';
import { getProductionReferences } from '@/lib/db/queries';
import { fail, ok, zodFieldErrors, type ActionState } from './types';

function productionError(message: string, code?: string) {
  if (code === '23505') return 'An active production order already exists for this sales line.';
  if (code === 'PGRST116') return 'The production order changed. Reload and try again.';
  const errors: Record<string, string> = {
    PRODUCTION_FORBIDDEN: 'Production access denied.',
    PRODUCTION_APPROVE_OWNER_ONLY: 'Only the Owner can approve production.',
    PRODUCTION_LOCKED: 'Only draft production orders can be edited.',
    PRODUCTION_TRANSITION: 'Invalid production status transition.',
    PRODUCTION_REASON_REQUIRED: 'A reason is required to hold or cancel production.',
    PRODUCTION_SOURCE_INVALID: 'Select a confirmed sales line with the same SKU.',
    PRODUCTION_EXCEEDS_OUTSTANDING: 'Planned quantity exceeds the undelivered sales quantity.',
    PRODUCTION_DRAWING_INVALID: 'Select a drawing belonging to this sales order or its quotation.',
    PRODUCTION_SKU_INVALID: 'Select an active specification measured in 张.',
    PRODUCTION_SUPERVISOR_INVALID: 'Select an active supervisor.',
    PRODUCTION_GEOMETRY_INVALID: 'Drawing spacing must fit exactly.',
    PRODUCTION_REQUEST_CONFLICT:
      'This request was already saved with different data. Start a new order.',
  };
  return (
    Object.entries(errors).find(([key]) => message.includes(key))?.[1] ??
    'Production order could not be saved. Check the inputs and reload.'
  );
}

export async function saveProductionOrder(
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  await assertPermission('production:manage');
  const parsed = productionOrderSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success)
    return fail('Please check the highlighted fields', zodFieldErrors(parsed.error.issues));
  const d = parsed.data;
  const payload = {
    business_date: d.businessDate,
    sales_order_item_id: d.salesOrderItemId,
    internal_reason: d.salesOrderItemId ? null : d.internalReason,
    sku_id: d.skuId,
    drawing_id: d.drawingId,
    planned_quantity: d.plannedQuantity,
    required_date: d.requiredDate,
    priority: d.priority,
    planned_line: d.plannedLine || null,
    supervisor_id: d.supervisorId,
    notes: d.notes || null,
    attachment_path: d.attachmentPath || null,
  };
  const db = await createSupabaseServerClient();
  // Guard/audit triggers commit the planning row and audit event atomically.
  const result =
    d.version === 0
      ? await db.rpc('create_production_order', { p_id: d.id, p_input: payload })
      : await db
          .from('production_orders')
          .update(payload)
          .eq('id', d.id)
          .eq('version', d.version)
          .select('id')
          .single();
  if (result.error) return fail(productionError(result.error.message, result.error.code));
  revalidatePath('/production');
  revalidatePath(`/production/${d.id}`);
  return ok('Production order saved.', { id: d.id });
}

export async function transitionProductionOrder(
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  const parsed = productionTransitionSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success)
    return fail('Please check the highlighted fields', zodFieldErrors(parsed.error.issues));
  const d = parsed.data;
  await assertPermission(d.status === 'approved' ? 'production:approve' : 'production:manage');
  const db = await createSupabaseServerClient();
  const { error } = await db
    .from('production_orders')
    .update({ status: d.status, status_reason: d.reason || null })
    .eq('id', d.id)
    .eq('version', d.version)
    .select('id')
    .single();
  if (error) return fail(productionError(error.message, error.code));
  revalidatePath('/production');
  revalidatePath(`/production/${d.id}`);
  return ok('Production status updated.');
}

export async function searchProductionReferences(kind: string, search: string) {
  await assertPermission('production:manage');
  const parsed = z
    .object({
      kind: z.enum(['sales_items', 'skus', 'drawings', 'supervisors']),
      search: z.string().trim().max(80),
    })
    .safeParse({ kind, search });
  if (!parsed.success) return { rows: [], error: 'Search must be 80 characters or fewer.' };
  try {
    return { rows: await getProductionReferences(parsed.data.kind, parsed.data.search) };
  } catch {
    return { rows: [], error: 'Production references could not be loaded.' };
  }
}
