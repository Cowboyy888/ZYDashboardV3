'use client';
import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AttachmentField } from '@/components/purchasing/attachment-field';
import { useT } from '@/components/i18n-provider';
import { createDraftPurchaseOrder } from '@/lib/actions/purchasing';
import { CURRENCIES, type Currency } from '@/lib/domain/purchasing';
import type { ActionState } from '@/lib/actions/types';

const selectCls =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

interface SupplierOpt {
  id: string;
  name: string;
  defaultCurrency: Currency;
}

export function NewPoForm({ suppliers, today }: { suppliers: SupplierOpt[]; today: string }) {
  const { t, m } = useT();
  const router = useRouter();
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    createDraftPurchaseOrder,
    null,
  );

  useEffect(() => {
    if (state?.ok && state.data?.id) {
      router.push(`/purchasing/orders/${state.data.id}`);
    }
  }, [state, router]);

  return (
    <form action={formAction} className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('pur.newPo')}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="supplierId">{t('pur.supplier')}</Label>
            <select
              id="supplierId"
              name="supplierId"
              className={selectCls}
              required
              defaultValue=""
            >
              <option value="" disabled>
                {t('common.select')}
              </option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="currency">{t('pur.currency')}</Label>
            <select
              id="currency"
              name="currency"
              className={selectCls}
              defaultValue={suppliers[0]?.defaultCurrency ?? 'USD'}
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="orderDate">{t('pur.orderDate')}</Label>
            <Input id="orderDate" name="orderDate" type="date" defaultValue={today} required />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="notes">{t('common.notes')}</Label>
            <Input id="notes" name="notes" />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>{t('pur.attachment')}</Label>
            <AttachmentField name="attachmentPath" label={t('pur.attachment')} folder="po" />
          </div>
        </CardContent>
      </Card>

      {state?.error && (
        <p className="rounded-md bg-destructive/10 px-3 py-1.5 text-sm text-destructive">
          {m(state.error)}
        </p>
      )}
      <Button type="submit" disabled={isPending}>
        {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
        {t('pur.createDraft')}
      </Button>
    </form>
  );
}
