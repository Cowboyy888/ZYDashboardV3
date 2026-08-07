'use server';
import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { assertPermission } from '@/lib/auth';
import { writeAudit } from '@/lib/audit';
import {
  supplierSchema,
  supplierUpdateSchema,
  createPurchaseOrderSchema,
  updatePurchaseOrderSchema,
} from '@/lib/validation/schemas';
import { canCancel } from '@/lib/domain/purchasing';
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

// --- Purchase orders (header-only records — no line items, no receiving) -------

export async function createDraftPurchaseOrder(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await assertPermission('purchasing:manage');
  const parsed = createPurchaseOrderSchema.safeParse({
    supplierId: formData.get('supplierId'),
    orderDate: formData.get('orderDate'),
    currency: formData.get('currency'),
    notes: formData.get('notes'),
    attachmentPath: formData.get('attachmentPath'),
  });
  if (!parsed.success)
    return fail('Please check the highlighted fields', zodFieldErrors(parsed.error.issues));
  const d = parsed.data;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('purchase_orders')
    .insert({
      supplier_id: d.supplierId,
      order_date: d.orderDate,
      currency: d.currency,
      notes: d.notes ?? null,
      attachment_path: d.attachmentPath ?? null,
      created_by: user.id,
    })
    .select('id, po_number')
    .single();
  if (error) return fail(error.message);

  await writeAudit(user, {
    action: 'purchase_order.create',
    entity: 'purchase_orders',
    entityId: data.id,
    newValue: { supplierId: d.supplierId, currency: d.currency },
  });
  revalidatePath('/purchasing/orders');
  revalidatePath('/purchasing');
  return ok('Purchase order created as Draft', { id: data.id });
}

/**
 * Draft-only: correct a PO's supplier/currency/order date/notes. The DB
 * trigger (enforce_po_header_immutable, 0013_purchasing.sql) already allows
 * this while status = 'draft' and blocks it otherwise (PO_HEADER_LOCKED) —
 * checked here first for a friendly message. Attachment isn't editable here
 * (AttachmentField has no way to show/preserve an existing upload); use a
 * new PO if the wrong file was attached.
 */
export async function updatePurchaseOrderHeader(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await assertPermission('purchasing:manage');
  const parsed = updatePurchaseOrderSchema.safeParse({
    id: formData.get('id'),
    supplierId: formData.get('supplierId'),
    orderDate: formData.get('orderDate'),
    currency: formData.get('currency'),
    notes: formData.get('notes'),
  });
  if (!parsed.success)
    return fail('Please check the highlighted fields', zodFieldErrors(parsed.error.issues));
  const d = parsed.data;

  const supabase = await createSupabaseServerClient();
  const { data: po } = await supabase
    .from('purchase_orders')
    .select('status')
    .eq('id', d.id)
    .maybeSingle();
  if (!po) return fail('Purchase order not found');
  if (po.status !== 'draft') return fail('Only a Draft purchase order can be edited.');

  const { error } = await supabase
    .from('purchase_orders')
    .update({
      supplier_id: d.supplierId,
      order_date: d.orderDate,
      currency: d.currency,
      notes: d.notes ?? null,
    })
    .eq('id', d.id);
  if (error) {
    if (error.message.includes('PO_HEADER_LOCKED'))
      return fail('Only a Draft purchase order can be edited.');
    return fail(error.message);
  }

  await writeAudit(user, {
    action: 'purchase_order.update',
    entity: 'purchase_orders',
    entityId: d.id,
    newValue: { supplierId: d.supplierId, currency: d.currency },
  });
  revalidatePath(`/purchasing/orders/${d.id}`);
  revalidatePath('/purchasing/orders');
  revalidatePath('/purchasing');
  return ok('Purchase order updated');
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
