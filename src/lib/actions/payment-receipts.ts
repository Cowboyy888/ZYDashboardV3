'use server';
import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { assertPermission } from '@/lib/auth';
import { writeAudit } from '@/lib/audit';
import { recordDepositPaymentSchema, recordFinalPaymentSchema } from '@/lib/validation/schemas';
import { canRecordPayment } from '@/lib/domain/deposit-invoice';
import {
  canRecordFinalPayment,
  computeBalanceDue,
  computeTotalPaid,
} from '@/lib/domain/payment-receipt';
import { fail, ok, zodFieldErrors, type ActionState } from './types';

/** Records a Deposit-tagged payment receipt against a SO's deposit invoice. */
export async function recordDepositPayment(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await assertPermission('sales:manage');
  const parsed = recordDepositPaymentSchema.safeParse({
    depositInvoiceId: formData.get('depositInvoiceId'),
    amount: formData.get('amount'),
    paidDate: formData.get('paidDate'),
    method: formData.get('method'),
    notes: formData.get('notes'),
  });
  if (!parsed.success)
    return fail('Please check the highlighted fields', zodFieldErrors(parsed.error.issues));
  const d = parsed.data;

  const supabase = await createSupabaseServerClient();

  const { data: invoice } = await supabase
    .from('deposit_invoices')
    .select('status, sales_order_id')
    .eq('id', d.depositInvoiceId)
    .maybeSingle();
  if (!invoice) return fail('Deposit invoice not found');
  if (!canRecordPayment(invoice.status)) {
    return fail(`A ${invoice.status} deposit invoice cannot receive a new payment.`);
  }

  const { data, error } = await supabase
    .from('payment_receipts')
    .insert({
      sales_order_id: invoice.sales_order_id,
      deposit_invoice_id: d.depositInvoiceId,
      receipt_type: 'deposit',
      amount: d.amount,
      paid_date: d.paidDate,
      method: d.method ?? null,
      notes: d.notes ?? null,
      recorded_by: user.id,
    })
    .select('id, receipt_number')
    .single();
  if (error) return fail(error.message);

  await writeAudit(user, {
    action: 'payment_receipt.record_deposit',
    entity: 'payment_receipts',
    entityId: data.id,
    newValue: { depositInvoiceId: d.depositInvoiceId, amount: d.amount, paidDate: d.paidDate },
  });
  revalidatePath(`/sales/orders/${invoice.sales_order_id}`);
  revalidatePath('/sales/orders');
  revalidatePath('/sales');
  return ok('Payment recorded', { id: data.id, receiptNumber: data.receipt_number });
}

/**
 * Records a Final-payment-tagged receipt against the remaining balance, once
 * the deposit invoice has reached 'paid'. Multiple partial final payments are
 * allowed, same ledger posture as recordDepositPayment.
 */
export async function recordFinalPayment(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await assertPermission('sales:manage');
  const parsed = recordFinalPaymentSchema.safeParse({
    depositInvoiceId: formData.get('depositInvoiceId'),
    amount: formData.get('amount'),
    paidDate: formData.get('paidDate'),
    method: formData.get('method'),
    notes: formData.get('notes'),
  });
  if (!parsed.success)
    return fail('Please check the highlighted fields', zodFieldErrors(parsed.error.issues));
  const d = parsed.data;

  const supabase = await createSupabaseServerClient();

  const { data: invoice } = await supabase
    .from('deposit_invoices')
    .select('status, sales_order_id, total_order_amount')
    .eq('id', d.depositInvoiceId)
    .maybeSingle();
  if (!invoice) return fail('Deposit invoice not found');

  const { data: receipts } = await supabase
    .from('payment_receipts')
    .select('amount, receipt_type')
    .eq('sales_order_id', invoice.sales_order_id);
  const balanceDue = computeBalanceDue(
    invoice.total_order_amount,
    computeTotalPaid(receipts ?? []),
  );

  if (!canRecordFinalPayment(invoice.status, balanceDue)) {
    return fail(
      invoice.status !== 'paid'
        ? 'The deposit must be fully paid before a final payment can be recorded.'
        : 'This sales order has no remaining balance to collect.',
    );
  }

  const { data, error } = await supabase
    .from('payment_receipts')
    .insert({
      sales_order_id: invoice.sales_order_id,
      deposit_invoice_id: d.depositInvoiceId,
      receipt_type: 'final',
      amount: d.amount,
      paid_date: d.paidDate,
      method: d.method ?? null,
      notes: d.notes ?? null,
      recorded_by: user.id,
    })
    .select('id, receipt_number')
    .single();
  if (error) return fail(error.message);

  await writeAudit(user, {
    action: 'payment_receipt.record_final',
    entity: 'payment_receipts',
    entityId: data.id,
    newValue: { depositInvoiceId: d.depositInvoiceId, amount: d.amount, paidDate: d.paidDate },
  });
  revalidatePath(`/sales/orders/${invoice.sales_order_id}`);
  revalidatePath('/sales/orders');
  revalidatePath('/sales');
  return ok('Final payment recorded', { id: data.id, receiptNumber: data.receipt_number });
}
