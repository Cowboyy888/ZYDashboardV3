'use server';
import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { assertPermission } from '@/lib/auth';
import { writeAudit } from '@/lib/audit';
import { priceRecordSchema, priceTypeSchema } from '@/lib/validation/schemas';
import { fail, ok, zodFieldErrors, type ActionState } from './types';

const LIST_PATH = '/sales/prices';

// --- Price types (small editable list, same shape as inquiry customer types) ----

export async function createPriceType(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await assertPermission('price_records:manage');
  const parsed = priceTypeSchema.safeParse({ name: formData.get('name') });
  if (!parsed.success)
    return fail('Please check the highlighted fields', zodFieldErrors(parsed.error.issues));

  const supabase = await createSupabaseServerClient();
  const { data: last } = await supabase
    .from('price_types')
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data, error } = await supabase
    .from('price_types')
    .insert({ name: parsed.data.name, sort_order: (last?.sort_order ?? 0) + 1, is_active: true })
    .select('id')
    .single();
  if (error) return fail(error.message);

  await writeAudit(user, {
    action: 'price_type.create',
    entity: 'price_types',
    entityId: data.id,
    newValue: parsed.data,
  });
  revalidatePath('/settings/price-types');
  return ok('Price type added');
}

export async function togglePriceType(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await assertPermission('price_records:manage');
  const id = String(formData.get('id') ?? '');
  const isActive = String(formData.get('isActive')) === 'true';
  if (!id) return fail('Missing price type');
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('price_types')
    .update({ is_active: !isActive })
    .eq('id', id);
  if (error) return fail(error.message);
  await writeAudit(user, {
    action: isActive ? 'price_type.archive' : 'price_type.activate',
    entity: 'price_types',
    entityId: id,
  });
  revalidatePath('/settings/price-types');
  return ok(isActive ? 'Price type archived' : 'Price type reactivated');
}

// --- Price records ----------------------------------------------------------------

function priceRecordForm(formData: FormData) {
  return {
    skuId: formData.get('skuId'),
    customerId: formData.get('customerId'),
    priceTypeId: formData.get('priceTypeId'),
    price: formData.get('price'),
    currency: formData.get('currency'),
    unit: formData.get('unit'),
    minimumQuantity: formData.get('minimumQuantity'),
    effectiveDate: formData.get('effectiveDate'),
    expiryDate: formData.get('expiryDate'),
    notes: formData.get('notes'),
  };
}

/**
 * Auto-expires whatever active price already covers this exact
 * (sku, customer, price type) context, so the new one is the only active row
 * left for it — see 0046_price_records.sql's header for why this lives here
 * rather than a DB constraint. Never deletes or overwrites the old row, only
 * flips its status.
 */
async function supersedeActivePrice(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  {
    skuId,
    customerId,
    priceTypeId,
  }: { skuId: string; customerId: string | null; priceTypeId: string },
): Promise<void> {
  let q = supabase
    .from('price_records')
    .update({ status: 'expired' })
    .eq('sku_id', skuId)
    .eq('price_type_id', priceTypeId)
    .eq('status', 'active');
  q = customerId ? q.eq('customer_id', customerId) : q.is('customer_id', null);
  await q;
}

export async function createPriceRecord(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await assertPermission('price_records:manage');
  const parsed = priceRecordSchema.safeParse(priceRecordForm(formData));
  if (!parsed.success)
    return fail('Please check the highlighted fields', zodFieldErrors(parsed.error.issues));
  const d = parsed.data;

  const supabase = await createSupabaseServerClient();
  await supersedeActivePrice(supabase, {
    skuId: d.skuId,
    customerId: d.customerId ?? null,
    priceTypeId: d.priceTypeId,
  });

  const { data, error } = await supabase
    .from('price_records')
    .insert({
      sku_id: d.skuId,
      customer_id: d.customerId ?? null,
      price_type_id: d.priceTypeId,
      price: d.price,
      currency: d.currency,
      unit: d.unit,
      minimum_quantity: d.minimumQuantity ?? null,
      effective_date: d.effectiveDate,
      expiry_date: d.expiryDate ?? null,
      notes: d.notes ?? null,
      created_by: user.id,
    })
    .select('id')
    .single();
  if (error) return fail(error.message);

  await writeAudit(user, {
    action: 'price_record.create',
    entity: 'price_records',
    entityId: data.id,
    newValue: { skuId: d.skuId, customerId: d.customerId, price: d.price, currency: d.currency },
  });
  revalidatePath(LIST_PATH);
  return ok('Price record saved', { id: data.id as string });
}

/**
 * Edits a record IN PLACE — this is for fixing a typo/mistake on the record
 * just entered, not for recording a new price (that's createPriceRecord,
 * which supersedes instead of overwriting). Does not touch status or
 * superseding — if the sku/customer/type context changed, the old
 * superseded record is left exactly as it was.
 */
export async function updatePriceRecord(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await assertPermission('price_records:manage');
  const id = String(formData.get('id') ?? '');
  if (!id) return fail('Missing price record');
  const parsed = priceRecordSchema.safeParse(priceRecordForm(formData));
  if (!parsed.success)
    return fail('Please check the highlighted fields', zodFieldErrors(parsed.error.issues));
  const d = parsed.data;

  const supabase = await createSupabaseServerClient();
  const { data: existing } = await supabase
    .from('price_records')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (!existing) return fail('Price record not found');

  const { error } = await supabase
    .from('price_records')
    .update({
      sku_id: d.skuId,
      customer_id: d.customerId ?? null,
      price_type_id: d.priceTypeId,
      price: d.price,
      currency: d.currency,
      unit: d.unit,
      minimum_quantity: d.minimumQuantity ?? null,
      effective_date: d.effectiveDate,
      expiry_date: d.expiryDate ?? null,
      notes: d.notes ?? null,
    })
    .eq('id', id);
  if (error) return fail(error.message);

  await writeAudit(user, {
    action: 'price_record.update',
    entity: 'price_records',
    entityId: id,
    oldValue: { price: existing.price, currency: existing.currency },
    newValue: { price: d.price, currency: d.currency },
  });
  revalidatePath(LIST_PATH);
  return ok('Price record updated');
}

/** Status -> cancelled. Never deletes — history stays searchable per spec. */
export async function deactivatePriceRecord(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await assertPermission('price_records:manage');
  const id = String(formData.get('id') ?? '');
  if (!id) return fail('Missing price record');

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('price_records')
    .update({ status: 'cancelled' })
    .eq('id', id);
  if (error) return fail(error.message);

  await writeAudit(user, {
    action: 'price_record.deactivate',
    entity: 'price_records',
    entityId: id,
  });
  revalidatePath(LIST_PATH);
  return ok('Price record deactivated');
}
