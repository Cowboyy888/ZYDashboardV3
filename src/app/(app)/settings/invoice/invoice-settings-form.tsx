'use client';
import { useActionState, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SubmitButton } from '@/components/forms/submit-button';
import { FormError } from '@/components/forms/form-error';
import { useT } from '@/components/i18n-provider';
import { saveInvoiceSettings } from '@/lib/actions/invoice-settings';
import type { ActionState } from '@/lib/actions/types';

/** Browser-safe view of the invoice_settings row (see page.tsx). */
export interface InvoiceSettingsView {
  vatRegistered: boolean;
  /** Fraction, e.g. 0.10 for 10%. */
  vatRate: number;
  vatTin: string;
  taxInvoicePrefix: string;
  commercialInvoicePrefix: string;
}

export function InvoiceSettingsForm({ settings }: { settings: InvoiceSettingsView }) {
  const { t, m } = useT();
  const [state, formAction] = useActionState<ActionState, FormData>(saveInvoiceSettings, null);
  // Only for showing/hiding the TIN field live — the actual gate that decides
  // what a printed invoice shows is vat_registered_snapshot on the quotation
  // row, stamped at creation time, never this live checkbox.
  const [vatRegistered, setVatRegistered] = useState(settings.vatRegistered);

  return (
    <form action={formAction} className="max-w-2xl space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            {t('ivc.vatStatus')}
            <Badge variant={vatRegistered ? 'success' : 'secondary'}>
              {vatRegistered ? t('ivc.registered') : t('ivc.notRegistered')}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">{t('ivc.currentNote')}</p>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="vatRegistered"
              defaultChecked={settings.vatRegistered}
              onChange={(e) => setVatRegistered(e.target.checked)}
            />
            {t('ivc.vatRegisteredLabel')}
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="inv-rate">{t('ivc.vatRate')}</Label>
              <Input
                id="inv-rate"
                name="vatRate"
                type="number"
                step="0.01"
                min="0"
                max="1"
                defaultValue={settings.vatRate}
              />
              <p className="text-xs text-muted-foreground">{t('ivc.vatRateHint')}</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inv-tin">{t('ivc.vatTin')}</Label>
              <Input
                id="inv-tin"
                name="vatTin"
                defaultValue={settings.vatTin}
                disabled={!vatRegistered}
                className={state?.fieldErrors?.vatTin ? 'border-destructive' : ''}
              />
              {state?.fieldErrors?.vatTin && (
                <p className="text-xs text-destructive">{m(state.fieldErrors.vatTin)}</p>
              )}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="inv-commercial-prefix">{t('ivc.commercialPrefix')}</Label>
              <Input
                id="inv-commercial-prefix"
                name="commercialInvoicePrefix"
                defaultValue={settings.commercialInvoicePrefix}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inv-tax-prefix">{t('ivc.taxPrefix')}</Label>
              <Input
                id="inv-tax-prefix"
                name="taxInvoicePrefix"
                defaultValue={settings.taxInvoicePrefix}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">{t('ivc.prefixHint')}</p>

          <FormError error={state?.error} />
          {state?.ok && state.message && (
            <p className="text-sm text-emerald-600 dark:text-emerald-400">{m(state.message)}</p>
          )}
          <SubmitButton>{t('ivc.save')}</SubmitButton>
        </CardContent>
      </Card>
    </form>
  );
}
