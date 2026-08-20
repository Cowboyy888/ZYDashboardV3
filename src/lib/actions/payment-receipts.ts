'use server';
import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { assertPermission } from '@/lib/auth';
import { writeAudit } from '@/lib/audit';
import { businessDate } from '@/lib/domain/datetime';
import { fail, ok, type ActionState } from './types';

/**
 * Marks a sales order's deposit or balance as paid — a simple flag, not an
 * amount-entry ledger. Mirrors quotations' markPaid (quotations.ts) exactly.
 */
export async function markSalesOrderPaid(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await assertPermission('sales:manage');
  const id = String(formData.get('id') ?? '');
  const which = String(formData.get('which') ?? '');
  if (!id || (which !== 'deposit' && which !== 'balance')) return fail('Invalid payment request');

  const column = which === 'deposit' ? 'deposit_paid_on' : 'balance_paid_on';
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('sales_orders')
    .update({ [column]: businessDate() })
    .eq('id', id);
  if (error) return fail(error.message);

  await writeAudit(user, {
    action: `sales_order.${which}_paid`,
    entity: 'sales_orders',
    entityId: id,
  });
  revalidatePath(`/sales/orders/${id}`);
  revalidatePath('/sales/orders');
  revalidatePath('/sales');
  return ok(which === 'deposit' ? 'Deposit marked paid' : 'Balance marked paid');
}
