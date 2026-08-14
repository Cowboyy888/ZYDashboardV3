'use server';
import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { assertPermission } from '@/lib/auth';
import { writeAudit } from '@/lib/audit';
import { generateDepositInvoiceSchema } from '@/lib/validation/schemas';
import { canGenerateDepositInvoice } from '@/lib/domain/deposit-invoice';
import type { SoStatus } from '@/lib/domain/sales';
import { fail, ok, zodFieldErrors, type ActionState } from './types';

export async function generateDepositInvoice(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await assertPermission('sales:manage');
  const parsed = generateDepositInvoiceSchema.safeParse({
    salesOrderId: formData.get('salesOrderId'),
    depositPercentage: formData.get('depositPercentage'),
  });
  if (!parsed.success)
    return fail('Please check the highlighted fields', zodFieldErrors(parsed.error.issues));
  const d = parsed.data;

  const supabase = await createSupabaseServerClient();

  const { data: so } = await supabase
    .from('sales_orders')
    .select('status, currency')
    .eq('id', d.salesOrderId)
    .maybeSingle();
  if (!so) return fail('Sales order not found');

  const { data: existing } = await supabase
    .from('deposit_invoices')
    .select('id')
    .eq('sales_order_id', d.salesOrderId)
    .neq('status', 'void')
    .maybeSingle();

  if (!canGenerateDepositInvoice(so.status as SoStatus, !!existing)) {
    return fail(
      existing
        ? 'A deposit invoice already exists for this sales order.'
        : 'The sales order must be confirmed before a deposit invoice can be generated.',
    );
  }

  const { data: items } = await supabase
    .from('sales_order_items')
    .select('line_total')
    .eq('sales_order_id', d.salesOrderId);
  const totalOrderAmount = (items ?? []).reduce((sum, i) => sum + Number(i.line_total), 0);

  const { data, error } = await supabase
    .from('deposit_invoices')
    .insert({
      sales_order_id: d.salesOrderId,
      deposit_percentage: d.depositPercentage,
      total_order_amount: totalOrderAmount,
      currency: so.currency,
      created_by: user.id,
    })
    .select('id')
    .single();
  if (error) return fail(error.message);

  await writeAudit(user, {
    action: 'deposit_invoice.generate',
    entity: 'deposit_invoices',
    entityId: data.id,
    newValue: {
      salesOrderId: d.salesOrderId,
      depositPercentage: d.depositPercentage,
      totalOrderAmount,
    },
  });
  revalidatePath(`/sales/orders/${d.salesOrderId}`);
  revalidatePath('/sales/orders');
  revalidatePath('/sales');
  return ok('Deposit invoice generated', { id: data.id });
}
