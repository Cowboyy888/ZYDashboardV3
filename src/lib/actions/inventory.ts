'use server';
import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { assertPermission } from '@/lib/auth';
import { writeAudit } from '@/lib/audit';
import { movementSchema, transferSchema, setStockTotalSchema } from '@/lib/validation/schemas';
import {
  toSignedQuantity,
  evaluateNegativeGuard,
  round3,
  type MovementType,
} from '@/lib/domain/stock-ledger';
import { canOverrideNegativeStock } from '@/lib/domain/rbac';
import type { Permission } from '@/lib/domain/rbac';
import { fail, ok, zodFieldErrors, type ActionState } from './types';

const PERMISSION_FOR: Record<MovementType, Permission> = {
  opening_balance: 'stock:opening',
  purchase_receipt: 'stock:production', // receiving handled in purchasing pass; guard as warehouse op
  production_output: 'stock:production',
  sale_delivery: 'stock:out',
  other_stock_out: 'stock:out',
  adjustment: 'stock:adjust',
  transfer_out: 'stock:transfer',
  transfer_in: 'stock:transfer',
};

async function currentBalance(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  skuId: string,
  locationId: string,
): Promise<number> {
  const { data } = await supabase
    .from('stock_balances')
    .select('quantity')
    .eq('sku_id', skuId)
    .eq('location_id', locationId)
    .maybeSingle();
  return Number(data?.quantity ?? 0);
}

/** Post a single stock movement (opening / production / stock-out / adjustment). */
export async function postMovement(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const type = String(formData.get('type') ?? '') as MovementType;
  const permission = PERMISSION_FOR[type];
  if (!permission) return fail('Unknown movement type');
  const user = await assertPermission(permission);

  const parsed = movementSchema.safeParse({
    skuId: formData.get('skuId'),
    locationId: formData.get('locationId'),
    type,
    businessDate: formData.get('businessDate'),
    quantity: formData.get('quantity'),
    notes: formData.get('notes'),
    overrideReason: formData.get('overrideReason'),
  });
  if (!parsed.success) return fail('Validation failed', zodFieldErrors(parsed.error.issues));
  const d = parsed.data;

  const signed = toSignedQuantity(d.type, d.quantity);
  const supabase = await createSupabaseServerClient();

  // Defence-in-depth negative guard (the DB trigger is the ultimate enforcer).
  const balance = await currentBalance(supabase, d.skuId, d.locationId);
  const guard = evaluateNegativeGuard({
    currentBalance: balance,
    delta: signed,
    allowOverride: canOverrideNegativeStock(user.role),
    overrideReason: d.overrideReason ?? null,
  });
  if (!guard.ok) {
    return fail(
      guard.reason ??
        'Movement would drive stock negative. An Owner override with a recorded reason is required.',
    );
  }

  const { data, error } = await supabase
    .from('stock_movements')
    .insert({
      sku_id: d.skuId,
      location_id: d.locationId,
      type: d.type,
      quantity: signed,
      business_date: d.businessDate,
      notes: d.notes ?? null,
      override_reason: guard.reason ? (d.overrideReason ?? null) : null,
      created_by: user.id,
    })
    .select('id')
    .single();
  if (error) {
    if (error.message.includes('NEGATIVE_STOCK')) {
      return fail('Blocked: movement would drive stock negative (Owner override required).');
    }
    return fail(error.message);
  }

  await writeAudit(user, {
    action: `stock.${d.type}`,
    entity: 'stock_movements',
    entityId: data.id,
    newValue: { skuId: d.skuId, locationId: d.locationId, quantity: signed },
  });
  revalidatePath('/inventory');
  revalidatePath('/dashboard');
  return ok('Movement recorded');
}

/**
 * "Set new total" shortcut for one SKU at one location: works out the delta
 * from the current balance and posts it as a normal `adjustment` movement
 * (same audit trail as the Record tab's Adjustment form — this just does the
 * subtraction for you instead of asking for a signed +/- quantity).
 */
export async function setStockTotal(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await assertPermission('stock:adjust');
  const parsed = setStockTotalSchema.safeParse({
    skuId: formData.get('skuId'),
    locationId: formData.get('locationId'),
    newTotal: formData.get('newTotal'),
    businessDate: formData.get('businessDate'),
    notes: formData.get('notes'),
    overrideReason: formData.get('overrideReason'),
  });
  if (!parsed.success) return fail('Validation failed', zodFieldErrors(parsed.error.issues));
  const d = parsed.data;

  const supabase = await createSupabaseServerClient();
  const balance = await currentBalance(supabase, d.skuId, d.locationId);
  const delta = round3(d.newTotal - balance);
  if (delta === 0) return ok('No change');

  const guard = evaluateNegativeGuard({
    currentBalance: balance,
    delta,
    allowOverride: canOverrideNegativeStock(user.role),
    overrideReason: d.overrideReason ?? null,
  });
  if (!guard.ok) {
    return fail(
      guard.reason ??
        'Movement would drive stock negative. An Owner override with a recorded reason is required.',
    );
  }

  const { data, error } = await supabase
    .from('stock_movements')
    .insert({
      sku_id: d.skuId,
      location_id: d.locationId,
      type: 'adjustment',
      quantity: delta,
      business_date: d.businessDate,
      notes: d.notes ?? null,
      override_reason: guard.reason ? (d.overrideReason ?? null) : null,
      created_by: user.id,
    })
    .select('id')
    .single();
  if (error) {
    if (error.message.includes('NEGATIVE_STOCK')) {
      return fail('Blocked: movement would drive stock negative (Owner override required).');
    }
    return fail(error.message);
  }

  await writeAudit(user, {
    action: 'stock.adjustment',
    entity: 'stock_movements',
    entityId: data.id,
    oldValue: { total: balance },
    newValue: { total: d.newTotal, delta },
  });
  revalidatePath('/inventory');
  revalidatePath('/dashboard');
  return ok('Quantity updated');
}

/** Post a Storage Room <-> Warehouse transfer (atomic out/in pair via RPC). */
export async function postTransfer(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await assertPermission('stock:transfer');
  const parsed = transferSchema.safeParse({
    skuId: formData.get('skuId'),
    fromLocationId: formData.get('fromLocationId'),
    toLocationId: formData.get('toLocationId'),
    businessDate: formData.get('businessDate'),
    quantity: formData.get('quantity'),
    notes: formData.get('notes'),
  });
  if (!parsed.success) return fail('Validation failed', zodFieldErrors(parsed.error.issues));
  const d = parsed.data;

  const supabase = await createSupabaseServerClient();
  const sourceBalance = await currentBalance(supabase, d.skuId, d.fromLocationId);
  if (sourceBalance - d.quantity < 0) {
    return fail(
      `Insufficient stock at source (${sourceBalance}). Transfers cannot drive stock negative.`,
    );
  }

  const { data, error } = await supabase.rpc('post_stock_transfer', {
    p_sku: d.skuId,
    p_from: d.fromLocationId,
    p_to: d.toLocationId,
    p_qty: d.quantity,
    p_business_date: d.businessDate,
    p_notes: d.notes ?? null,
  });
  if (error) return fail(error.message);

  await writeAudit(user, {
    action: 'stock.transfer',
    entity: 'stock_movements',
    entityId: String(data ?? ''),
    newValue: { skuId: d.skuId, from: d.fromLocationId, to: d.toLocationId, quantity: d.quantity },
  });
  revalidatePath('/inventory');
  revalidatePath('/dashboard');
  return ok('Transfer recorded (company total unchanged)');
}
