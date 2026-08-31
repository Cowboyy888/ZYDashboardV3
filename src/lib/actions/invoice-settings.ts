'use server';
import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { assertPermission } from '@/lib/auth';
import { writeAudit } from '@/lib/audit';
import { invoiceSettingsSchema } from '@/lib/validation/schemas';
import { fail, ok, zodFieldErrors, type ActionState } from './types';

/**
 * Saves the company-wide VAT/invoice configuration (invoice_settings, id=1).
 *
 * Deliberately does NOT touch any existing quotation — vat_registered_snapshot
 * / vat_rate_snapshot are stamped once, at creation (createQuotation in
 * actions/quotations.ts), from whatever this setting says at that moment.
 * Changing this setting only ever affects quotations created afterward.
 */
export async function saveInvoiceSettings(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await assertPermission('invoice:manage');
  const parsed = invoiceSettingsSchema.safeParse({
    vatRegistered: formData.get('vatRegistered') === 'on',
    vatRate: formData.get('vatRate'),
    vatTin: formData.get('vatTin'),
    taxInvoicePrefix: formData.get('taxInvoicePrefix') || 'ZYS-TAX',
    commercialInvoicePrefix: formData.get('commercialInvoicePrefix') || 'ZYS-Q',
  });
  if (!parsed.success)
    return fail('Please check the highlighted fields', zodFieldErrors(parsed.error.issues));
  const d = parsed.data;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('invoice_settings')
    .update({
      vat_registered: d.vatRegistered,
      vat_rate: d.vatRate,
      vat_tin: d.vatTin ?? null,
      tax_invoice_prefix: d.taxInvoicePrefix,
      commercial_invoice_prefix: d.commercialInvoicePrefix,
    })
    .eq('id', 1);
  if (error) return fail(error.message);

  await writeAudit(user, {
    action: 'invoice_settings.update',
    entity: 'invoice_settings',
    entityId: '1',
    newValue: { vatRegistered: d.vatRegistered, vatRate: d.vatRate },
  });
  revalidatePath('/settings/invoice');
  return ok('Invoice settings saved');
}
