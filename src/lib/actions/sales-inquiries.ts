'use server';
import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { assertPermission } from '@/lib/auth';
import { writeAudit } from '@/lib/audit';
import { businessDate } from '@/lib/domain/datetime';
import {
  inquirySchema,
  inquiryUpdateSchema,
  inquiryFollowupSchema,
  inquiryCustomerTypeSchema,
  inquiryStatusSchema,
  type InquiryInput,
} from '@/lib/validation/schemas';
import { fail, ok, zodFieldErrors, type ActionState } from './types';

const INQUIRIES_PATH = '/sales/inquiries';

/** Map validated inquiry fields to DB columns (undefined → null). */
function inquiryColumns(d: InquiryInput) {
  return {
    inquiry_date: d.inquiryDate ?? businessDate(),
    salesperson_id: d.salespersonId ?? null,
    customer_id: d.customerId ?? null,
    customer_name: d.customerName,
    company_name: d.companyName ?? null,
    contact: d.contact ?? null,
    customer_type_id: d.customerTypeId ?? null,
    family_id: d.familyId ?? null,
    specification: d.specification ?? null,
    diameter: d.diameter ?? null,
    sheet_size: d.sheetSize ?? null,
    area_per_sheet: d.areaPerSheet ?? null,
    mesh_opening: d.meshOpening ?? null,
    quantity: d.quantity ?? null,
    delivery_location: d.deliveryLocation ?? null,
    factory_cost: d.factoryCost ?? null,
    quoted_price: d.quotedPrice ?? null,
    target_price: d.targetPrice ?? null,
    final_price: d.finalPrice ?? null,
    status_id: d.statusId ?? null,
    follow_up_date: d.followUpDate ?? null,
    follow_up_notes: d.followUpNotes ?? null,
    next_action: d.nextAction ?? null,
    remarks: d.remarks ?? null,
  };
}

function inquiryForm(formData: FormData) {
  return {
    inquiryDate: formData.get('inquiryDate'),
    salespersonId: formData.get('salespersonId'),
    customerId: formData.get('customerId'),
    customerName: formData.get('customerName'),
    companyName: formData.get('companyName'),
    contact: formData.get('contact'),
    customerTypeId: formData.get('customerTypeId'),
    familyId: formData.get('familyId'),
    specification: formData.get('specification'),
    diameter: formData.get('diameter'),
    sheetSize: formData.get('sheetSize'),
    areaPerSheet: formData.get('areaPerSheet'),
    meshOpening: formData.get('meshOpening'),
    quantity: formData.get('quantity'),
    deliveryLocation: formData.get('deliveryLocation'),
    factoryCost: formData.get('factoryCost'),
    quotedPrice: formData.get('quotedPrice'),
    targetPrice: formData.get('targetPrice'),
    finalPrice: formData.get('finalPrice'),
    statusId: formData.get('statusId'),
    followUpDate: formData.get('followUpDate'),
    followUpNotes: formData.get('followUpNotes'),
    nextAction: formData.get('nextAction'),
    remarks: formData.get('remarks'),
  };
}

export async function createInquiry(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await assertPermission('inquiries:manage');
  const parsed = inquirySchema.safeParse(inquiryForm(formData));
  if (!parsed.success)
    return fail('Please check the highlighted fields', zodFieldErrors(parsed.error.issues));

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('sales_inquiries')
    .insert({ ...inquiryColumns(parsed.data), created_by: user.id })
    .select('id, inquiry_no')
    .single();
  if (error) return fail(error.message);

  await writeAudit(user, {
    action: 'inquiry.create',
    entity: 'sales_inquiries',
    entityId: data.id,
    newValue: { inquiry_no: data.inquiry_no, customer: parsed.data.customerName },
  });
  revalidatePath(INQUIRIES_PATH);
  return ok(`Inquiry ${data.inquiry_no ?? ''} created`, {
    inquiryId: data.id,
    inquiryNo: data.inquiry_no,
  });
}

export async function updateInquiry(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await assertPermission('inquiries:manage');
  const parsed = inquiryUpdateSchema.safeParse({
    id: formData.get('id'),
    ...inquiryForm(formData),
  });
  if (!parsed.success)
    return fail('Please check the highlighted fields', zodFieldErrors(parsed.error.issues));
  const { id, ...rest } = parsed.data;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('sales_inquiries')
    .update(inquiryColumns(rest))
    .eq('id', id);
  if (error) return fail(error.message);

  await writeAudit(user, {
    action: 'inquiry.update',
    entity: 'sales_inquiries',
    entityId: id,
    newValue: { customer: rest.customerName },
  });
  revalidatePath(INQUIRIES_PATH);
  return ok('Inquiry updated');
}

export async function deleteInquiry(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await assertPermission('inquiries:manage');
  const id = String(formData.get('id') ?? '');
  if (!id) return fail('Missing inquiry');

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from('sales_inquiries').delete().eq('id', id);
  if (error) return fail(error.message);

  await writeAudit(user, { action: 'inquiry.delete', entity: 'sales_inquiries', entityId: id });
  revalidatePath(INQUIRIES_PATH);
  return ok('Inquiry deleted');
}

export async function addFollowup(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await assertPermission('inquiries:manage');
  const parsed = inquiryFollowupSchema.safeParse({
    inquiryId: formData.get('inquiryId'),
    followUpDate: formData.get('followUpDate'),
    previousAction: formData.get('previousAction'),
    customerResponse: formData.get('customerResponse'),
    nextFollowUpDate: formData.get('nextFollowUpDate'),
    responsibleId: formData.get('responsibleId'),
    statusId: formData.get('statusId'),
  });
  if (!parsed.success)
    return fail('Please check the highlighted fields', zodFieldErrors(parsed.error.issues));
  const d = parsed.data;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from('inquiry_followups').insert({
    inquiry_id: d.inquiryId,
    follow_up_date: d.followUpDate ?? businessDate(),
    previous_action: d.previousAction ?? null,
    customer_response: d.customerResponse ?? null,
    next_follow_up_date: d.nextFollowUpDate ?? null,
    responsible_id: d.responsibleId ?? null,
    status_id: d.statusId ?? null,
    created_by: user.id,
  });
  if (error) return fail(error.message);

  // Keep the inquiry's status + follow-up snapshot in step when provided.
  const patch: Record<string, unknown> = {};
  if (d.statusId) patch.status_id = d.statusId;
  if (d.nextFollowUpDate) patch.follow_up_date = d.nextFollowUpDate;
  if (Object.keys(patch).length > 0) {
    await supabase.from('sales_inquiries').update(patch).eq('id', d.inquiryId);
  }

  await writeAudit(user, {
    action: 'inquiry.followup',
    entity: 'inquiry_followups',
    entityId: d.inquiryId,
  });
  revalidatePath(INQUIRIES_PATH);
  return ok('Follow-up recorded');
}

// --- Editable lists (customer types + statuses) ---------------------------------

export async function createInquiryCustomerType(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await assertPermission('inquiries:manage');
  const parsed = inquiryCustomerTypeSchema.safeParse({ name: formData.get('name') });
  if (!parsed.success)
    return fail('Please check the highlighted fields', zodFieldErrors(parsed.error.issues));

  const supabase = await createSupabaseServerClient();
  const { data: last } = await supabase
    .from('inquiry_customer_types')
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data, error } = await supabase
    .from('inquiry_customer_types')
    .insert({ name: parsed.data.name, sort_order: (last?.sort_order ?? 0) + 1, is_active: true })
    .select('id')
    .single();
  if (error) {
    if (error.code === '23505') return fail('That customer type already exists.');
    return fail(error.message);
  }
  await writeAudit(user, {
    action: 'inquiry_customer_type.create',
    entity: 'inquiry_customer_types',
    entityId: data.id,
    newValue: parsed.data,
  });
  revalidatePath(INQUIRIES_PATH);
  return ok('Customer type added');
}

export async function toggleInquiryCustomerType(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await assertPermission('inquiries:manage');
  const id = String(formData.get('id') ?? '');
  const isActive = String(formData.get('isActive')) === 'true';
  if (!id) return fail('Missing customer type');
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('inquiry_customer_types')
    .update({ is_active: !isActive })
    .eq('id', id);
  if (error) return fail(error.message);
  await writeAudit(user, {
    action: isActive ? 'inquiry_customer_type.archive' : 'inquiry_customer_type.activate',
    entity: 'inquiry_customer_types',
    entityId: id,
  });
  revalidatePath(INQUIRIES_PATH);
  return ok(isActive ? 'Customer type archived' : 'Customer type reactivated');
}

export async function createInquiryStatus(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await assertPermission('inquiries:manage');
  const parsed = inquiryStatusSchema.safeParse({
    name: formData.get('name'),
    category: formData.get('category') || 'open',
  });
  if (!parsed.success)
    return fail('Please check the highlighted fields', zodFieldErrors(parsed.error.issues));

  const supabase = await createSupabaseServerClient();
  const { data: last } = await supabase
    .from('inquiry_statuses')
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data, error } = await supabase
    .from('inquiry_statuses')
    .insert({
      name: parsed.data.name,
      category: parsed.data.category,
      sort_order: (last?.sort_order ?? 0) + 1,
      is_active: true,
    })
    .select('id')
    .single();
  if (error) {
    if (error.code === '23505') return fail('That status already exists.');
    return fail(error.message);
  }
  await writeAudit(user, {
    action: 'inquiry_status.create',
    entity: 'inquiry_statuses',
    entityId: data.id,
    newValue: parsed.data,
  });
  revalidatePath(INQUIRIES_PATH);
  return ok('Status added');
}

export async function toggleInquiryStatus(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await assertPermission('inquiries:manage');
  const id = String(formData.get('id') ?? '');
  const isActive = String(formData.get('isActive')) === 'true';
  if (!id) return fail('Missing status');
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('inquiry_statuses')
    .update({ is_active: !isActive })
    .eq('id', id);
  if (error) return fail(error.message);
  await writeAudit(user, {
    action: isActive ? 'inquiry_status.archive' : 'inquiry_status.activate',
    entity: 'inquiry_statuses',
    entityId: id,
  });
  revalidatePath(INQUIRIES_PATH);
  return ok(isActive ? 'Status archived' : 'Status reactivated');
}
