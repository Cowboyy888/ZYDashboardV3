'use server';
import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { assertPermission } from '@/lib/auth';
import { writeAudit } from '@/lib/audit';
import {
  customerSchema,
  customerUpdateSchema,
  createSalesOrderSchema,
  addSalesOrderItemSchema,
  deliverGoodsSchema,
} from '@/lib/validation/schemas';
import { evaluateOverDeliveryGuard, canDeliverAgainst, canCancel } from '@/lib/domain/sales';
import { canOverrideNegativeStock } from '@/lib/domain/rbac';
import { fail, ok, zodFieldErrors, type ActionState } from './types';

// --- Customers -------------------------------------------------------------------

export async function createCustomer(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await assertPermission('sales:manage');
  const parsed = customerSchema.safeParse({
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
    .from('customers')
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
    action: 'customer.create',
    entity: 'customers',
    entityId: data.id,
    newValue: d,
  });
  revalidatePath('/sales/customers');
  return ok('Customer added');
}

export async function updateCustomer(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await assertPermission('sales:manage');
  const parsed = customerUpdateSchema.safeParse({
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
    .from('customers')
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
    action: 'customer.update',
    entity: 'customers',
    entityId: d.id,
    newValue: d,
  });
  revalidatePath('/sales/customers');
  return ok('Customer updated');
}

export async function toggleCustomer(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await assertPermission('sales:manage');
  const id = String(formData.get('id') ?? '');
  const isActive = String(formData.get('isActive')) === 'true';
  if (!id) return fail('Missing customer');

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from('customers').update({ is_active: !isActive }).eq('id', id);
  if (error) return fail(error.message);

  await writeAudit(user, {
    action: isActive ? 'customer.archive' : 'customer.activate',
    entity: 'customers',
    entityId: id,
  });
  revalidatePath('/sales/customers');
  return ok(isActive ? 'Customer archived' : 'Customer reactivated');
}

export async function deleteCustomer(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await assertPermission('sales:manage');
  const id = String(formData.get('id') ?? '');
  if (!id) return fail('Missing customer');

  const supabase = await createSupabaseServerClient();
  const { data: customer } = await supabase
    .from('customers')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (!customer) return fail('Customer not found');

  const { count } = await supabase
    .from('sales_orders')
    .select('id', { count: 'exact', head: true })
    .eq('customer_id', id);
  if ((count ?? 0) > 0) {
    return fail('Cannot delete: this customer has sales order history. Archive it instead.');
  }

  const { error } = await supabase.from('customers').delete().eq('id', id);
  if (error) {
    // Backstop for the FK on_delete restrict guard — treat as "has history".
    if (error.code === '23503')
      return fail('Cannot delete: this customer has sales order history. Archive it instead.');
    return fail(error.message);
  }

  await writeAudit(user, {
    action: 'customer.delete',
    entity: 'customers',
    entityId: id,
    oldValue: customer,
  });
  revalidatePath('/sales/customers');
  return ok('Customer deleted');
}

// --- Sales orders ------------------------------------------------------------------

export async function createDraftSalesOrder(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await assertPermission('sales:manage');

  let items: unknown;
  try {
    items = JSON.parse(String(formData.get('itemsJson') ?? '[]'));
  } catch {
    return fail('Invalid line items');
  }

  const parsed = createSalesOrderSchema.safeParse({
    customerId: formData.get('customerId'),
    orderDate: formData.get('orderDate'),
    expectedDeliveryDate: formData.get('expectedDeliveryDate'),
    currency: formData.get('currency'),
    notes: formData.get('notes'),
    attachmentPath: formData.get('attachmentPath'),
    items,
  });
  if (!parsed.success)
    return fail('Please check the highlighted fields', zodFieldErrors(parsed.error.issues));
  const d = parsed.data;

  const supabase = await createSupabaseServerClient();

  // The sale unit is never chosen by the user — it is always the SKU's own
  // stock unit, so there is no conversion path to get wrong.
  const skuIds = [...new Set(d.items.map((i) => i.skuId))];
  const { data: skuRows } = await supabase.from('skus').select('id, unit').in('id', skuIds);
  const unitBySku = new Map((skuRows ?? []).map((s) => [s.id as string, s.unit as string]));
  for (const item of d.items) {
    if (!unitBySku.has(item.skuId))
      return fail('One of the selected specifications was not found.');
  }

  const { data, error } = await supabase.rpc('create_draft_sales_order', {
    p_customer_id: d.customerId,
    p_order_date: d.orderDate,
    p_expected_delivery_date: d.expectedDeliveryDate ?? null,
    p_currency: d.currency,
    p_notes: d.notes ?? null,
    p_attachment_path: d.attachmentPath ?? null,
    p_items: d.items.map((i) => ({
      skuId: i.skuId,
      locationId: i.locationId,
      unit: unitBySku.get(i.skuId),
      orderedQty: i.orderedQty,
      unitPrice: i.unitPrice,
      areaPerSheet: i.areaPerSheet ?? null,
      pricePerSqm: i.pricePerSqm ?? null,
    })),
  });
  if (error) return fail(error.message);

  const soId = String(data ?? '');
  await writeAudit(user, {
    action: 'sales_order.create',
    entity: 'sales_orders',
    entityId: soId,
    newValue: {
      customerId: d.customerId,
      currency: d.currency,
      itemCount: d.items.length,
    },
  });
  revalidatePath('/sales/orders');
  revalidatePath('/sales');
  return ok('Sales order created as Draft', { id: soId });
}

/**
 * Add one line item to an already-existing Draft sales order — used both by
 * a human filling in items by hand and, notably, to complete a Sales Order
 * that was auto-created header-only from a paid Quotation deposit (see
 * markPaid in actions/quotations.ts), which has zero items until someone
 * picks the real SKU/warehouse for each quotation line.
 */
export async function addSalesOrderItem(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await assertPermission('sales:manage');
  const parsed = addSalesOrderItemSchema.safeParse({
    salesOrderId: formData.get('salesOrderId'),
    skuId: formData.get('skuId'),
    locationId: formData.get('locationId'),
    orderedQty: formData.get('orderedQty'),
    unitPrice: formData.get('unitPrice'),
  });
  if (!parsed.success)
    return fail('Please check the highlighted fields', zodFieldErrors(parsed.error.issues));
  const d = parsed.data;

  const supabase = await createSupabaseServerClient();
  const { data: so } = await supabase
    .from('sales_orders')
    .select('status')
    .eq('id', d.salesOrderId)
    .maybeSingle();
  if (!so) return fail('Sales order not found');
  if (so.status !== 'draft') return fail('Items can only be added while the sales order is Draft.');

  // The sale unit is never chosen by the user — it is always the SKU's own
  // stock unit, matching createDraftSalesOrder's own derivation.
  const { data: sku } = await supabase.from('skus').select('unit').eq('id', d.skuId).maybeSingle();
  if (!sku) return fail('The selected specification was not found.');

  const { error } = await supabase.from('sales_order_items').insert({
    sales_order_id: d.salesOrderId,
    sku_id: d.skuId,
    location_id: d.locationId,
    unit: sku.unit,
    ordered_qty: d.orderedQty,
    unit_price: d.unitPrice,
  });
  if (error) {
    if (error.message.includes('SO_ITEM_LOCKED'))
      return fail('Items can only be added while the sales order is Draft.');
    return fail(error.message);
  }

  await writeAudit(user, {
    action: 'sales_order.add_item',
    entity: 'sales_order_items',
    entityId: d.salesOrderId,
    newValue: { skuId: d.skuId, locationId: d.locationId, orderedQty: d.orderedQty },
  });
  revalidatePath(`/sales/orders/${d.salesOrderId}`);
  return ok('Item added');
}

export async function removeSalesOrderItem(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await assertPermission('sales:manage');
  const itemId = String(formData.get('itemId') ?? '');
  const salesOrderId = String(formData.get('salesOrderId') ?? '');
  if (!itemId) return fail('Missing line item');

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from('sales_order_items').delete().eq('id', itemId);
  if (error) {
    if (error.message.includes('SO_ITEM_LOCKED'))
      return fail('Items can only be removed while the sales order is Draft.');
    return fail(error.message);
  }

  await writeAudit(user, {
    action: 'sales_order.remove_item',
    entity: 'sales_order_items',
    entityId: itemId,
  });
  if (salesOrderId) revalidatePath(`/sales/orders/${salesOrderId}`);
  return ok('Item removed');
}

export async function confirmSalesOrder(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await assertPermission('sales:manage');
  const id = String(formData.get('id') ?? '');
  if (!id) return fail('Missing sales order');

  const supabase = await createSupabaseServerClient();
  const { data: so } = await supabase
    .from('sales_orders')
    .select('status')
    .eq('id', id)
    .maybeSingle();
  if (!so) return fail('Sales order not found');
  if (so.status !== 'draft') return fail('Only a Draft sales order can be confirmed.');

  const { count: itemCount } = await supabase
    .from('sales_order_items')
    .select('id', { count: 'exact', head: true })
    .eq('sales_order_id', id);
  if (!itemCount) return fail('Add at least one line item before confirming this sales order.');

  const { error } = await supabase
    .from('sales_orders')
    .update({ status: 'confirmed', confirmed_at: new Date().toISOString() })
    .eq('id', id)
    .eq('status', 'draft');
  if (error) {
    if (error.message.includes('SO_CONFIRM_NO_ITEMS'))
      return fail('Add at least one line item before confirming this sales order.');
    return fail(error.message);
  }

  await writeAudit(user, {
    action: 'sales_order.confirm',
    entity: 'sales_orders',
    entityId: id,
    oldValue: { status: 'draft' },
    newValue: { status: 'confirmed' },
  });
  revalidatePath(`/sales/orders/${id}`);
  revalidatePath('/sales/orders');
  revalidatePath('/sales');
  return ok('Sales order confirmed');
}

export async function cancelSalesOrder(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await assertPermission('sales:manage');
  const id = String(formData.get('id') ?? '');
  if (!id) return fail('Missing sales order');

  const supabase = await createSupabaseServerClient();
  const { data: so } = await supabase
    .from('sales_orders')
    .select('status')
    .eq('id', id)
    .maybeSingle();
  if (!so) return fail('Sales order not found');
  if (!canCancel(so.status)) return fail(`A ${so.status} sales order cannot be cancelled.`);

  const { error } = await supabase
    .from('sales_orders')
    .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
    .eq('id', id);
  if (error) return fail(error.message);

  await writeAudit(user, {
    action: 'sales_order.cancel',
    entity: 'sales_orders',
    entityId: id,
    oldValue: { status: so.status },
    newValue: { status: 'cancelled' },
  });
  revalidatePath(`/sales/orders/${id}`);
  revalidatePath('/sales/orders');
  revalidatePath('/sales');
  return ok('Sales order cancelled');
}

// --- Delivery ----------------------------------------------------------------------

export async function deliverGoods(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await assertPermission('sales:manage');
  const parsed = deliverGoodsSchema.safeParse({
    itemId: formData.get('itemId'),
    quantity: formData.get('quantity'),
    deliveredDate: formData.get('deliveredDate'),
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
    .from('sales_order_items')
    .select('id, ordered_qty, sales_order_id, sales_orders(status)')
    .eq('id', d.itemId)
    .maybeSingle();
  if (!item) return fail('Sales order item not found');
  const soStatus = (item as unknown as { sales_orders: { status: string } | { status: string }[] })
    .sales_orders;
  const status = Array.isArray(soStatus) ? soStatus[0]?.status : soStatus?.status;
  if (!status || !canDeliverAgainst(status as Parameters<typeof canDeliverAgainst>[0])) {
    return fail('This sales order cannot be delivered against in its current status.');
  }

  const { data: deliveredRow } = await supabase
    .from('sales_order_item_delivered')
    .select('delivered_qty')
    .eq('item_id', d.itemId)
    .maybeSingle();
  const alreadyDelivered = Number(deliveredRow?.delivered_qty ?? 0);

  // Defence-in-depth over-delivery guard (the DB trigger is the ultimate enforcer).
  const guard = evaluateOverDeliveryGuard({
    orderedQty: Number(item.ordered_qty),
    alreadyDeliveredQty: alreadyDelivered,
    deltaQty: d.quantity,
    allowOverride: canOverrideNegativeStock(user.role),
    overrideReason: d.overrideReason ?? null,
  });
  if (!guard.ok) {
    return fail(
      guard.reason ??
        'Delivering this quantity would exceed the ordered amount (Owner override required).',
    );
  }

  const { data, error } = await supabase.rpc('post_sale_delivery', {
    p_item_id: d.itemId,
    p_qty: d.quantity,
    p_business_date: d.deliveredDate,
    p_notes: d.notes ?? null,
    p_attachment_path: d.attachmentPath ?? null,
    p_batch_reference: d.batchReference ?? null,
    p_override_reason: guard.reason ? (d.overrideReason ?? null) : null,
  });
  if (error) {
    if (error.message.includes('OVER_DELIVERY'))
      return fail('Blocked: delivering this quantity would exceed the ordered amount.');
    if (error.message.includes('CANCELLED_SO'))
      return fail('Blocked: this sales order is cancelled.');
    if (error.message.includes('DRAFT_SO'))
      return fail('Blocked: this sales order has not been confirmed yet.');
    return fail(error.message);
  }

  await writeAudit(user, {
    action: 'sales_order.deliver',
    entity: 'stock_movements',
    entityId: String(data ?? ''),
    newValue: { itemId: d.itemId, quantity: d.quantity },
  });
  revalidatePath(`/sales/orders/${item.sales_order_id}`);
  revalidatePath('/sales/orders');
  revalidatePath('/sales');
  revalidatePath('/inventory');
  revalidatePath('/dashboard');
  return ok('Goods delivered');
}
