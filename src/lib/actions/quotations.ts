'use server';
import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { assertPermission, type CurrentUser } from '@/lib/auth';
import { writeAudit } from '@/lib/audit';
import { businessDate } from '@/lib/domain/datetime';
import { DOC_PREFIX, normalizeDepositPct, type DocumentKind } from '@/lib/domain/quotation';
import {
  shouldCreateSalesOrderFromQuotation,
  findMatchingCustomerId,
  buildSalesOrderNoteFromQuotation,
} from '@/lib/domain/sales';
import {
  quotationSchema,
  quotationUpdateSchema,
  issueDocumentSchema,
  updateQuotationDepositPctSchema,
  type QuotationItemInput,
} from '@/lib/validation/schemas';
import { fail, ok, zodFieldErrors, type ActionState } from './types';

const LIST_PATH = '/sales/quotations';

/** Parse the repeated line-item fields the editor submits. */
function parseItems(formData: FormData): unknown[] {
  const descriptions = formData.getAll('itemDescription');
  return descriptions.map((_, i) => ({
    description: formData.getAll('itemDescription')[i],
    wireDia: formData.getAll('itemWireDia')[i],
    steelGrade: formData.getAll('itemSteelGrade')[i],
    unit: formData.getAll('itemUnit')[i],
    unitPrice: formData.getAll('itemUnitPrice')[i],
    quantity: formData.getAll('itemQuantity')[i],
    totalSheets: formData.getAll('itemTotalSheets')[i],
  }));
}

function quotationForm(formData: FormData) {
  return {
    customerId: formData.get('customerId'),
    customerName: formData.get('customerName'),
    contact: formData.get('contact'),
    projectSite: formData.get('projectSite'),
    quotationDate: formData.get('quotationDate') || businessDate(),
    validDays: formData.get('validDays') || 15,
    currency: formData.get('currency') || 'USD',
    depositPct: formData.get('depositPct') || 30,
    pricingBasis: formData.get('pricingBasis'),
    notes: formData.get('notes'),
    items: parseItems(formData).filter(
      (i) => String((i as { description?: unknown }).description ?? '').trim().length > 0,
    ),
  };
}

function itemRows(quotationId: string, items: QuotationItemInput[]) {
  return items.map((it, idx) => ({
    quotation_id: quotationId,
    line_no: idx + 1,
    description: it.description,
    wire_dia: it.wireDia ?? null,
    steel_grade: it.steelGrade ?? null,
    unit: it.unit,
    unit_price: it.unitPrice,
    quantity: it.quantity,
    total_sheets: it.totalSheets ?? null,
  }));
}

export async function createQuotation(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await assertPermission('sales:manage');
  const parsed = quotationSchema.safeParse(quotationForm(formData));
  if (!parsed.success)
    return fail('Please check the highlighted fields', zodFieldErrors(parsed.error.issues));
  const d = parsed.data;

  const supabase = await createSupabaseServerClient();

  // Snapshot the company's CURRENT VAT status onto this quotation — never
  // read live from invoice_settings again once issued, so re-tuning VAT
  // registration later can't silently alter an already-issued document
  // (see 0043_invoice_vat.sql).
  const { data: invoiceSettings } = await supabase
    .from('invoice_settings')
    .select('vat_registered, vat_rate')
    .eq('id', 1)
    .maybeSingle();

  const { data, error } = await supabase
    .from('quotations')
    .insert({
      customer_id: d.customerId ?? null,
      customer_name: d.customerName,
      contact: d.contact ?? null,
      project_site: d.projectSite ?? null,
      quotation_date: d.quotationDate,
      valid_days: d.validDays,
      currency: d.currency,
      deposit_pct: normalizeDepositPct(d.depositPct),
      pricing_basis: d.pricingBasis ?? null,
      notes: d.notes ?? null,
      vat_registered_snapshot: invoiceSettings?.vat_registered ?? false,
      vat_rate_snapshot: invoiceSettings?.vat_registered ? (invoiceSettings.vat_rate ?? 0) : 0,
      created_by: user.id,
    })
    .select('id')
    .single();
  if (error) return fail(error.message);

  const { error: itemsError } = await supabase
    .from('quotation_items')
    .insert(itemRows(data.id, d.items));
  if (itemsError) return fail(itemsError.message);

  await writeAudit(user, {
    action: 'quotation.create',
    entity: 'quotations',
    entityId: data.id,
    newValue: { customer: d.customerName, lines: d.items.length },
  });
  revalidatePath(LIST_PATH);
  return ok('Quotation created', { quotationId: data.id });
}

export async function updateQuotation(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await assertPermission('sales:manage');
  const parsed = quotationUpdateSchema.safeParse({
    id: formData.get('id'),
    ...quotationForm(formData),
  });
  if (!parsed.success)
    return fail('Please check the highlighted fields', zodFieldErrors(parsed.error.issues));
  const { id, items, ...d } = parsed.data;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('quotations')
    .update({
      customer_id: d.customerId ?? null,
      customer_name: d.customerName,
      contact: d.contact ?? null,
      project_site: d.projectSite ?? null,
      quotation_date: d.quotationDate,
      valid_days: d.validDays,
      currency: d.currency,
      deposit_pct: normalizeDepositPct(d.depositPct),
      pricing_basis: d.pricingBasis ?? null,
      notes: d.notes ?? null,
    })
    .eq('id', id);
  if (error) return fail(error.message);

  // Line items are replaced wholesale — simplest correct behaviour, and the
  // amounts are regenerated by the database either way.
  await supabase.from('quotation_items').delete().eq('quotation_id', id);
  const { error: itemsError } = await supabase.from('quotation_items').insert(itemRows(id, items));
  if (itemsError) return fail(itemsError.message);

  await writeAudit(user, {
    action: 'quotation.update',
    entity: 'quotations',
    entityId: id,
    newValue: { customer: d.customerName, lines: items.length },
  });
  revalidatePath(LIST_PATH);
  revalidatePath(`${LIST_PATH}/${id}`);
  return ok('Quotation updated');
}

/** Quick inline edit — just the deposit share, from the list row, no line items touched. */
export async function updateQuotationDepositPct(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await assertPermission('sales:manage');
  const parsed = updateQuotationDepositPctSchema.safeParse({
    id: formData.get('id'),
    depositPct: formData.get('depositPct'),
  });
  if (!parsed.success)
    return fail('Please check the highlighted fields', zodFieldErrors(parsed.error.issues));
  const { id, depositPct } = parsed.data;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('quotations')
    .update({ deposit_pct: normalizeDepositPct(depositPct) })
    .eq('id', id);
  if (error) return fail(error.message);

  await writeAudit(user, {
    action: 'quotation.update_deposit_pct',
    entity: 'quotations',
    entityId: id,
    newValue: { depositPct },
  });
  revalidatePath(LIST_PATH);
  return ok('Deposit percentage updated');
}

export async function deleteQuotation(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await assertPermission('sales:manage');
  const id = String(formData.get('id') ?? '');
  if (!id) return fail('Missing quotation');

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from('quotations').delete().eq('id', id);
  if (error) return fail(error.message);

  await writeAudit(user, { action: 'quotation.delete', entity: 'quotations', entityId: id });
  revalidatePath(LIST_PATH);
  return ok('Quotation deleted');
}

/**
 * Assign the document number for one of the three documents (idempotent — the
 * RPC returns the existing number if it was already issued, so regenerating a
 * PDF never burns a new sequence number).
 */
export async function issueDocument(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await assertPermission('sales:manage');
  const parsed = issueDocumentSchema.safeParse({
    quotationId: formData.get('quotationId'),
    kind: formData.get('kind'),
  });
  if (!parsed.success) return fail('Invalid document request');
  const { quotationId, kind } = parsed.data;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('issue_quotation_document', {
    p_quotation: quotationId,
    p_kind: DOC_PREFIX[kind as DocumentKind],
    p_issue_date: businessDate(),
  });
  if (error) return fail(error.message);

  await writeAudit(user, {
    action: `quotation.issue_${kind}`,
    entity: 'quotations',
    entityId: quotationId,
    newValue: { docNo: data },
  });
  revalidatePath(`${LIST_PATH}/${quotationId}`);
  return ok('Document issued', { docNo: data as string });
}

/** Record that the deposit or the balance has been paid. */
export async function markPaid(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await assertPermission('sales:manage');
  const id = String(formData.get('id') ?? '');
  const which = String(formData.get('which') ?? '');
  if (!id || (which !== 'deposit' && which !== 'balance')) return fail('Invalid payment request');

  const supabase = await createSupabaseServerClient();
  const { data: quotation } = await supabase
    .from('quotations')
    .select('id, customer_id, customer_name, contact, currency, quotation_no, deposit_paid_on')
    .eq('id', id)
    .maybeSingle();
  if (!quotation) return fail('Quotation not found');

  const column = which === 'deposit' ? 'deposit_paid_on' : 'balance_paid_on';
  const { error } = await supabase
    .from('quotations')
    .update({ [column]: businessDate() })
    .eq('id', id);
  if (error) return fail(error.message);

  await writeAudit(user, {
    action: `quotation.${which}_paid`,
    entity: 'quotations',
    entityId: id,
  });
  revalidatePath(`${LIST_PATH}/${id}`);

  // Connect this quotation to a Sales Order the first time its deposit is
  // paid — see src/lib/domain/sales.ts for why this is a header-only Draft
  // (zero line items: quotation lines are free text, sales order lines need
  // a real catalog SKU + warehouse, which nothing here can safely guess).
  let soWarning: string | null = null;
  if (which === 'deposit' && shouldCreateSalesOrderFromQuotation(quotation.deposit_paid_on)) {
    soWarning = await createSalesOrderFromQuotation(supabase, user, quotation);
  }

  const successMessage = which === 'deposit' ? 'Deposit marked paid' : 'Balance marked paid';
  return ok(soWarning ? `${successMessage} — ${soWarning}` : successMessage);
}

/**
 * Best-effort side effect of markPaid: resolve (or create) the customer, then
 * create the Draft Sales Order via the same RPC the manual "New Sales Order"
 * form uses. Returns a warning string if it failed — the deposit-paid write
 * itself must never be rolled back just because this secondary step didn't
 * complete, since the user's actual action (recording that money came in)
 * already succeeded.
 */
async function createSalesOrderFromQuotation(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  user: CurrentUser,
  quotation: {
    id: string;
    customer_id: string | null;
    customer_name: string;
    contact: string | null;
    currency: string;
    quotation_no: string | null;
  },
): Promise<string | null> {
  let customerId = quotation.customer_id;

  if (!customerId) {
    const { data: existing } = await supabase
      .from('customers')
      .select('id, name')
      .eq('is_active', true);
    customerId = findMatchingCustomerId(quotation.customer_name, existing ?? []);

    if (!customerId) {
      const { data: created, error: customerError } = await supabase
        .from('customers')
        .insert({
          name: quotation.customer_name,
          phone: quotation.contact ?? null,
          default_currency: quotation.currency,
        })
        .select('id')
        .single();
      if (customerError) return `could not create a linked Sales Order (${customerError.message})`;
      customerId = created.id as string;
    }

    // Link the quotation to the resolved/created customer too, so it no
    // longer shows as unlinked — best-effort, not fatal if it fails.
    await supabase.from('quotations').update({ customer_id: customerId }).eq('id', quotation.id);
  }

  const { data: soId, error: soError } = await supabase.rpc('create_draft_sales_order', {
    p_customer_id: customerId,
    p_order_date: businessDate(),
    p_expected_delivery_date: null,
    p_currency: quotation.currency,
    p_notes: buildSalesOrderNoteFromQuotation(quotation.quotation_no),
    p_attachment_path: null,
    p_items: [],
    p_quotation_id: quotation.id,
  });
  if (soError) return `could not create a linked Sales Order (${soError.message})`;

  await writeAudit(user, {
    action: 'sales_order.create_from_quotation',
    entity: 'sales_orders',
    entityId: String(soId ?? ''),
    newValue: { quotationId: quotation.id },
  });
  revalidatePath('/sales/orders');
  revalidatePath('/sales');
  return null;
}
