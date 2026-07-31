'use server';
import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { assertPermission } from '@/lib/auth';
import { writeAudit } from '@/lib/audit';
import {
  supplierSchema,
  supplierUpdateSchema,
  createPurchaseOrderSchema,
  receiveGoodsSchema,
  skuSchema,
} from '@/lib/validation/schemas';
import { evaluateOverReceiptGuard, canReceiveAgainst, canCancel } from '@/lib/domain/purchasing';
import { canOverrideNegativeStock } from '@/lib/domain/rbac';
import { fail, ok, zodFieldErrors, type ActionState } from './types';

// --- Suppliers -----------------------------------------------------------------

export async function createSupplier(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await assertPermission('purchasing:manage');
  const parsed = supplierSchema.safeParse({
    name: formData.get('name'),
    nameChinese: formData.get('nameChinese'),
    nameEnglish: formData.get('nameEnglish'),
    contactPerson: formData.get('contactPerson'),
    phone: formData.get('phone'),
    address: formData.get('address'),
    taxId: formData.get('taxId'),
    paymentTerms: formData.get('paymentTerms'),
    defaultCurrency: formData.get('defaultCurrency') || 'USD',
    notes: formData.get('notes'),
  });
  if (!parsed.success)
    return fail('Please check the highlighted fields', zodFieldErrors(parsed.error.issues));
  const d = parsed.data;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('suppliers')
    .insert({
      name: d.name,
      name_chinese: d.nameChinese ?? null,
      name_english: d.nameEnglish ?? null,
      contact_person: d.contactPerson ?? null,
      phone: d.phone ?? null,
      address: d.address ?? null,
      tax_id: d.taxId ?? null,
      payment_terms: d.paymentTerms ?? null,
      default_currency: d.defaultCurrency,
      notes: d.notes ?? null,
      is_active: true,
    })
    .select('id')
    .single();
  if (error) return fail(error.message);

  await writeAudit(user, {
    action: 'supplier.create',
    entity: 'suppliers',
    entityId: data.id,
    newValue: d,
  });
  revalidatePath('/purchasing/suppliers');
  return ok('Supplier added');
}

export async function updateSupplier(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await assertPermission('purchasing:manage');
  const parsed = supplierUpdateSchema.safeParse({
    id: formData.get('id'),
    name: formData.get('name'),
    nameChinese: formData.get('nameChinese'),
    nameEnglish: formData.get('nameEnglish'),
    contactPerson: formData.get('contactPerson'),
    phone: formData.get('phone'),
    address: formData.get('address'),
    taxId: formData.get('taxId'),
    paymentTerms: formData.get('paymentTerms'),
    defaultCurrency: formData.get('defaultCurrency') || 'USD',
    notes: formData.get('notes'),
  });
  if (!parsed.success)
    return fail('Please check the highlighted fields', zodFieldErrors(parsed.error.issues));
  const d = parsed.data;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('suppliers')
    .update({
      name: d.name,
      name_chinese: d.nameChinese ?? null,
      name_english: d.nameEnglish ?? null,
      contact_person: d.contactPerson ?? null,
      phone: d.phone ?? null,
      address: d.address ?? null,
      tax_id: d.taxId ?? null,
      payment_terms: d.paymentTerms ?? null,
      default_currency: d.defaultCurrency,
      notes: d.notes ?? null,
    })
    .eq('id', d.id);
  if (error) return fail(error.message);

  await writeAudit(user, {
    action: 'supplier.update',
    entity: 'suppliers',
    entityId: d.id,
    newValue: d,
  });
  revalidatePath('/purchasing/suppliers');
  return ok('Supplier updated');
}

export async function toggleSupplier(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await assertPermission('purchasing:manage');
  const id = String(formData.get('id') ?? '');
  const isActive = String(formData.get('isActive')) === 'true';
  if (!id) return fail('Missing supplier');

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from('suppliers').update({ is_active: !isActive }).eq('id', id);
  if (error) return fail(error.message);

  await writeAudit(user, {
    action: isActive ? 'supplier.archive' : 'supplier.activate',
    entity: 'suppliers',
    entityId: id,
  });
  revalidatePath('/purchasing/suppliers');
  return ok(isActive ? 'Supplier archived' : 'Supplier reactivated');
}

export async function deleteSupplier(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await assertPermission('purchasing:manage');
  const id = String(formData.get('id') ?? '');
  if (!id) return fail('Missing supplier');

  const supabase = await createSupabaseServerClient();
  const { data: supplier } = await supabase
    .from('suppliers')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (!supplier) return fail('Supplier not found');

  const { count } = await supabase
    .from('purchase_orders')
    .select('id', { count: 'exact', head: true })
    .eq('supplier_id', id);
  if ((count ?? 0) > 0) {
    return fail('Cannot delete: this supplier has purchase order history. Archive it instead.');
  }

  const { error } = await supabase.from('suppliers').delete().eq('id', id);
  if (error) {
    // Backstop for the FK on_delete restrict guard — treat as "has history".
    if (error.code === '23503')
      return fail('Cannot delete: this supplier has purchase order history. Archive it instead.');
    return fail(error.message);
  }

  await writeAudit(user, {
    action: 'supplier.delete',
    entity: 'suppliers',
    entityId: id,
    oldValue: supplier,
  });
  revalidatePath('/purchasing/suppliers');
  return ok('Supplier deleted');
}

/**
 * Quick-add a new specification (SKU) from the "New purchase order" form, for
 * when the item being ordered isn't in the catalog yet. Gated by
 * purchasing:manage (not products:manage) — creating a spec as part of
 * placing an order is a purchasing action; Settings > Products stays
 * products:manage-only for general catalog upkeep. Otherwise identical to
 * createSku in lib/actions/settings.ts (same table, same duplicate rule).
 */
export async function createSkuForPurchaseOrder(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await assertPermission('purchasing:manage');
  const parsed = skuSchema.safeParse({
    familyId: formData.get('familyId'),
    diameter: formData.get('diameter'),
    size: formData.get('size'),
    hole: formData.get('hole'),
    rodCount: formData.get('rodCount'),
    extra: formData.get('extra'),
    condition: formData.get('condition'),
    unit: formData.get('unit'),
    minimumLevel: 0,
    isActive: true,
    notes: null,
  });
  if (!parsed.success)
    return fail('Please check the highlighted fields', zodFieldErrors(parsed.error.issues));
  const d = parsed.data;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('skus')
    .insert({
      family_id: d.familyId,
      diameter: d.diameter ?? null,
      size: d.size ?? null,
      hole: d.hole ?? null,
      rod_count: d.rodCount ?? null,
      extra: d.extra ?? null,
      condition: d.condition,
      unit: d.unit,
      minimum_level: 0,
      is_active: true,
    })
    .select('id, unit')
    .single();
  if (error) {
    if (error.code === '23505')
      return fail(
        'A specification with these exact attributes already exists — pick it from the list instead.',
      );
    return fail(error.message);
  }

  await writeAudit(user, {
    action: 'sku.create',
    entity: 'skus',
    entityId: data.id,
    newValue: { ...d, viaPurchaseOrder: true },
  });
  revalidatePath('/settings/products');
  revalidatePath('/inventory');
  return ok('Specification added', { id: data.id, unit: data.unit });
}

// --- Purchase orders -------------------------------------------------------------

export async function createDraftPurchaseOrder(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await assertPermission('purchasing:manage');

  let items: unknown;
  try {
    items = JSON.parse(String(formData.get('itemsJson') ?? '[]'));
  } catch {
    return fail('Invalid line items');
  }

  const parsed = createPurchaseOrderSchema.safeParse({
    supplierId: formData.get('supplierId'),
    orderDate: formData.get('orderDate'),
    expectedArrivalDate: formData.get('expectedArrivalDate'),
    currency: formData.get('currency'),
    notes: formData.get('notes'),
    attachmentPath: formData.get('attachmentPath'),
    items,
  });
  if (!parsed.success)
    return fail('Please check the highlighted fields', zodFieldErrors(parsed.error.issues));
  const d = parsed.data;

  const supabase = await createSupabaseServerClient();

  // The purchase unit is never chosen by the user — it is always the SKU's own
  // stock unit, so there is no conversion path to get wrong.
  const skuIds = [...new Set(d.items.map((i) => i.skuId))];
  const { data: skuRows } = await supabase.from('skus').select('id, unit').in('id', skuIds);
  const unitBySku = new Map((skuRows ?? []).map((s) => [s.id as string, s.unit as string]));
  for (const item of d.items) {
    if (!unitBySku.has(item.skuId))
      return fail('One of the selected specifications was not found.');
  }

  const { data, error } = await supabase.rpc('create_draft_purchase_order', {
    p_supplier_id: d.supplierId,
    p_order_date: d.orderDate,
    p_expected_arrival_date: d.expectedArrivalDate ?? null,
    p_currency: d.currency,
    p_notes: d.notes ?? null,
    p_attachment_path: d.attachmentPath ?? null,
    p_items: d.items.map((i) => ({
      skuId: i.skuId,
      locationId: i.locationId,
      unit: unitBySku.get(i.skuId),
      orderedQty: i.orderedQty,
      unitCost: i.unitCost,
    })),
  });
  if (error) return fail(error.message);

  const poId = String(data ?? '');
  await writeAudit(user, {
    action: 'purchase_order.create',
    entity: 'purchase_orders',
    entityId: poId,
    newValue: {
      supplierId: d.supplierId,
      currency: d.currency,
      itemCount: d.items.length,
    },
  });
  revalidatePath('/purchasing/orders');
  revalidatePath('/purchasing');
  return ok('Purchase order created as Draft', { id: poId });
}

export async function issuePurchaseOrder(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await assertPermission('purchasing:manage');
  const id = String(formData.get('id') ?? '');
  if (!id) return fail('Missing purchase order');

  const supabase = await createSupabaseServerClient();
  const { data: po } = await supabase
    .from('purchase_orders')
    .select('status')
    .eq('id', id)
    .maybeSingle();
  if (!po) return fail('Purchase order not found');
  if (po.status !== 'draft') return fail('Only a Draft purchase order can be issued.');

  const { error } = await supabase
    .from('purchase_orders')
    .update({ status: 'ordered', issued_at: new Date().toISOString() })
    .eq('id', id)
    .eq('status', 'draft');
  if (error) return fail(error.message);

  await writeAudit(user, {
    action: 'purchase_order.issue',
    entity: 'purchase_orders',
    entityId: id,
    oldValue: { status: 'draft' },
    newValue: { status: 'ordered' },
  });
  revalidatePath(`/purchasing/orders/${id}`);
  revalidatePath('/purchasing/orders');
  revalidatePath('/purchasing');
  return ok('Purchase order issued');
}

export async function cancelPurchaseOrder(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await assertPermission('purchasing:manage');
  const id = String(formData.get('id') ?? '');
  if (!id) return fail('Missing purchase order');

  const supabase = await createSupabaseServerClient();
  const { data: po } = await supabase
    .from('purchase_orders')
    .select('status')
    .eq('id', id)
    .maybeSingle();
  if (!po) return fail('Purchase order not found');
  if (!canCancel(po.status)) return fail(`A ${po.status} purchase order cannot be cancelled.`);

  const { error } = await supabase
    .from('purchase_orders')
    .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
    .eq('id', id);
  if (error) return fail(error.message);

  await writeAudit(user, {
    action: 'purchase_order.cancel',
    entity: 'purchase_orders',
    entityId: id,
    oldValue: { status: po.status },
    newValue: { status: 'cancelled' },
  });
  revalidatePath(`/purchasing/orders/${id}`);
  revalidatePath('/purchasing/orders');
  revalidatePath('/purchasing');
  return ok('Purchase order cancelled');
}

// --- Goods receiving ---------------------------------------------------------

export async function receiveGoods(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await assertPermission('purchasing:manage');
  const parsed = receiveGoodsSchema.safeParse({
    itemId: formData.get('itemId'),
    quantity: formData.get('quantity'),
    receivedDate: formData.get('receivedDate'),
    batchReference: formData.get('batchReference'),
    notes: formData.get('notes'),
    attachmentPath: formData.get('attachmentPath'),
    overrideReason: formData.get('overrideReason'),
  });
  if (!parsed.success)
    return fail('Please check the highlighted fields', zodFieldErrors(parsed.error.issues));
  const d = parsed.data;

  const supabase = await createSupabaseServerClient();
  const { data: item } = await supabase
    .from('purchase_order_items')
    .select('id, ordered_qty, purchase_order_id, purchase_orders(status)')
    .eq('id', d.itemId)
    .maybeSingle();
  if (!item) return fail('Purchase order item not found');
  const poStatus = (
    item as unknown as { purchase_orders: { status: string } | { status: string }[] }
  ).purchase_orders;
  const status = Array.isArray(poStatus) ? poStatus[0]?.status : poStatus?.status;
  if (!status || !canReceiveAgainst(status as Parameters<typeof canReceiveAgainst>[0])) {
    return fail('This purchase order cannot receive stock in its current status.');
  }

  const { data: receivedRow } = await supabase
    .from('purchase_order_item_received')
    .select('received_qty')
    .eq('item_id', d.itemId)
    .maybeSingle();
  const alreadyReceived = Number(receivedRow?.received_qty ?? 0);

  // Defence-in-depth over-receipt guard (the DB trigger is the ultimate enforcer).
  const guard = evaluateOverReceiptGuard({
    orderedQty: Number(item.ordered_qty),
    alreadyReceivedQty: alreadyReceived,
    deltaQty: d.quantity,
    allowOverride: canOverrideNegativeStock(user.role),
    overrideReason: d.overrideReason ?? null,
  });
  if (!guard.ok) {
    return fail(
      guard.reason ??
        'Receiving this quantity would exceed the ordered amount (Owner override required).',
    );
  }

  const { data, error } = await supabase.rpc('post_purchase_receipt', {
    p_item_id: d.itemId,
    p_qty: d.quantity,
    p_business_date: d.receivedDate,
    p_notes: d.notes ?? null,
    p_attachment_path: d.attachmentPath ?? null,
    p_batch_reference: d.batchReference ?? null,
    p_override_reason: guard.reason ? (d.overrideReason ?? null) : null,
  });
  if (error) {
    if (error.message.includes('OVER_RECEIPT'))
      return fail('Blocked: receiving this quantity would exceed the ordered amount.');
    if (error.message.includes('CANCELLED_PO'))
      return fail('Blocked: this purchase order is cancelled.');
    if (error.message.includes('DRAFT_PO'))
      return fail('Blocked: this purchase order has not been issued yet.');
    return fail(error.message);
  }

  await writeAudit(user, {
    action: 'purchase_order.receive',
    entity: 'stock_movements',
    entityId: String(data ?? ''),
    newValue: { itemId: d.itemId, quantity: d.quantity },
  });
  revalidatePath(`/purchasing/orders/${item.purchase_order_id}`);
  revalidatePath('/purchasing/orders');
  revalidatePath('/purchasing');
  revalidatePath('/inventory');
  revalidatePath('/dashboard');
  return ok('Goods received');
}
