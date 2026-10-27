'use server';
import { revalidatePath } from 'next/cache';
import { assertPermission } from '@/lib/auth';
import { writeAudit } from '@/lib/audit';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import {
  wireMeshDrawingSchema,
  wireMeshDrawingUpdateSchema,
  type WireMeshDrawingInput,
} from '@/lib/validation/schemas';
import { calculateWireMesh } from '@/lib/domain/wire-mesh';
import { fail, ok, zodFieldErrors, type ActionState } from './types';

const PATH = '/sales/wire-mesh-drawings';

function formData(form: FormData) {
  return {
    quotationId: form.get('quotationId'),
    salesOrderId: form.get('salesOrderId'),
    meshSpecification: form.get('meshSpecification'),
    wireDiameterMm: form.get('wireDiameterMm'),
    sheetLengthMm: form.get('sheetLengthMm'),
    sheetWidthMm: form.get('sheetWidthMm'),
    lengthSpacingMm: form.get('lengthSpacingMm'),
    widthSpacingMm: form.get('widthSpacingMm'),
    overhangLeftMm: form.get('overhangLeftMm'),
    overhangRightMm: form.get('overhangRightMm'),
    overhangTopMm: form.get('overhangTopMm'),
    overhangBottomMm: form.get('overhangBottomMm'),
    quantity: form.get('quantity'),
  };
}

function columns(input: WireMeshDrawingInput, customerName: string) {
  return {
    quotation_id: input.quotationId ?? null,
    sales_order_id: input.salesOrderId ?? null,
    customer_name: customerName,
    mesh_specification: input.meshSpecification,
    wire_diameter_mm: input.wireDiameterMm,
    sheet_length_mm: input.sheetLengthMm,
    sheet_width_mm: input.sheetWidthMm,
    length_spacing_mm: input.lengthSpacingMm,
    width_spacing_mm: input.widthSpacingMm,
    overhang_left_mm: input.overhangLeftMm,
    overhang_right_mm: input.overhangRightMm,
    overhang_top_mm: input.overhangTopMm,
    overhang_bottom_mm: input.overhangBottomMm,
    quantity: input.quantity,
  };
}

async function customerNameForReference(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  input: WireMeshDrawingInput,
) {
  if (input.quotationId) {
    const { data } = await supabase
      .from('quotations')
      .select('customer_name')
      .eq('id', input.quotationId)
      .maybeSingle();
    return data?.customer_name ?? null;
  }
  const { data: order } = await supabase
    .from('sales_orders')
    .select('customer_id')
    .eq('id', input.salesOrderId!)
    .maybeSingle();
  if (!order) return null;
  const { data: customer } = await supabase
    .from('customers')
    .select('name')
    .eq('id', order.customer_id)
    .maybeSingle();
  return customer?.name ?? null;
}

export async function saveWireMeshDrawing(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const user = await assertPermission('sales:manage');
  const raw = formData(form);
  const parsed = (form.get('id') ? wireMeshDrawingUpdateSchema : wireMeshDrawingSchema).safeParse({
    id: form.get('id'),
    ...raw,
  });
  if (!parsed.success)
    return fail('Please check the highlighted fields', zodFieldErrors(parsed.error.issues));
  const { id, ...input } = parsed.data as WireMeshDrawingInput & { id?: string };
  const calculation = calculateWireMesh(input);
  if (calculation.errors.length) return fail(calculation.errors[0]!);

  const supabase = await createSupabaseServerClient();
  const customerName = await customerNameForReference(supabase, input);
  if (!customerName) return fail('The selected quotation or sales order was not found.');
  const row = columns(input, customerName);
  const query = id
    ? supabase
        .from('wire_mesh_drawings')
        .update({ ...row, updated_by: user.id })
        .eq('id', id)
        .select('id')
        .single()
    : supabase
        .from('wire_mesh_drawings')
        .insert({ ...row, created_by: user.id, updated_by: user.id })
        .select('id')
        .single();
  const { data, error } = await query;
  if (error) return fail(error.message);
  await writeAudit(user, {
    action: id ? 'wire_mesh_drawing.update' : 'wire_mesh_drawing.create',
    entity: 'wire_mesh_drawings',
    entityId: data.id,
    newValue: {
      quotationId: input.quotationId,
      salesOrderId: input.salesOrderId,
      meshSpecification: input.meshSpecification,
    },
  });
  revalidatePath(PATH);
  return ok(id ? 'Drawing updated' : 'Drawing saved', { id: data.id });
}
