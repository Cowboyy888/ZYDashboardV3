'use client';
import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { NativeSelect } from '@/components/ui/native-select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ActionForm } from '@/components/forms/action-form';
import { SubmitButton } from '@/components/forms/submit-button';
import { ConfirmActionButton } from '@/components/forms/confirm-action-button';
import { FormError } from '@/components/forms/form-error';
import { useT } from '@/components/i18n-provider';
import {
  createCustomer,
  updateCustomer,
  toggleCustomer,
  deleteCustomer,
} from '@/lib/actions/sales';
import { CURRENCIES } from '@/lib/domain/sales';
import type { ActionState } from '@/lib/actions/types';
import type { CustomerRow } from '@/lib/db/types';

function CustomerFields({ defaults }: { defaults?: CustomerRow }) {
  const { t } = useT();
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="name">{t('sal.customerName')}</Label>
          <Input id="name" name="name" required defaultValue={defaults?.name} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="defaultCurrency">{t('sal.defaultCurrency')}</Label>
          <NativeSelect
            id="defaultCurrency"
            name="defaultCurrency"
            defaultValue={defaults?.default_currency ?? 'USD'}
          >
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="nameChinese">{t('sal.nameChinese')}</Label>
          <Input id="nameChinese" name="nameChinese" defaultValue={defaults?.name_chinese ?? ''} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="nameEnglish">{t('sal.nameEnglish')}</Label>
          <Input id="nameEnglish" name="nameEnglish" defaultValue={defaults?.name_english ?? ''} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="contactPerson">{t('sal.contactPerson')}</Label>
          <Input
            id="contactPerson"
            name="contactPerson"
            defaultValue={defaults?.contact_person ?? ''}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="phone">{t('sal.phone')}</Label>
          <Input id="phone" name="phone" defaultValue={defaults?.phone ?? ''} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="address">{t('sal.address')}</Label>
          <Input id="address" name="address" defaultValue={defaults?.address ?? ''} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="taxId">{t('sal.taxId')}</Label>
          <Input id="taxId" name="taxId" defaultValue={defaults?.tax_id ?? ''} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="paymentTerms">{t('sal.paymentTerms')}</Label>
          <Input
            id="paymentTerms"
            name="paymentTerms"
            defaultValue={defaults?.payment_terms ?? ''}
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="notes">{t('common.notes')}</Label>
          <Input id="notes" name="notes" defaultValue={defaults?.notes ?? ''} />
        </div>
      </div>
    </>
  );
}

function EditCustomerRow({ customer, onDone }: { customer: CustomerRow; onDone: () => void }) {
  const { t } = useT();
  const [state, formAction, pending] = useActionState<ActionState, FormData>(updateCustomer, null);

  useEffect(() => {
    if (state?.ok) onDone();
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <TableRow>
      <TableCell colSpan={7} className="bg-muted/30">
        <form action={formAction} className="space-y-3 py-2">
          <input type="hidden" name="id" value={customer.id} />
          <CustomerFields defaults={customer} />
          <FormError error={state?.error} />
          <div className="flex gap-2">
            <SubmitButton>{t('common.save')}</SubmitButton>
            <button
              type="button"
              className="text-sm text-muted-foreground underline"
              disabled={pending}
              onClick={onDone}
            >
              {t('common.cancel')}
            </button>
          </div>
        </form>
      </TableCell>
    </TableRow>
  );
}

function CustomerRowItem({ customer, canManage }: { customer: CustomerRow; canManage: boolean }) {
  const { t } = useT();
  const router = useRouter();
  const [editing, setEditing] = useState(false);

  if (editing) {
    return <EditCustomerRow customer={customer} onDone={() => setEditing(false)} />;
  }

  return (
    <TableRow>
      <TableCell className="whitespace-nowrap font-mono text-xs">
        {customer.customer_code}
      </TableCell>
      <TableCell className="font-medium">
        {customer.name}
        {customer.name_chinese && (
          <span className="ml-2 text-muted-foreground">{customer.name_chinese}</span>
        )}
      </TableCell>
      <TableCell>{customer.contact_person || '—'}</TableCell>
      <TableCell>{customer.phone || '—'}</TableCell>
      <TableCell>{customer.default_currency}</TableCell>
      <TableCell>
        {customer.is_active ? (
          <Badge variant="secondary">{t('common.active')}</Badge>
        ) : (
          <Badge variant="outline">{t('common.archived')}</Badge>
        )}
      </TableCell>
      {canManage && (
        <TableCell className="space-x-2 text-right">
          <button
            type="button"
            className="text-sm text-primary underline"
            onClick={() => setEditing(true)}
          >
            {t('common.edit')}
          </button>
          <ConfirmActionButton
            action={toggleCustomer}
            formData={{ id: customer.id, isActive: String(customer.is_active) }}
            label={customer.is_active ? t('common.archive') : t('common.reactivate')}
            confirmText={
              customer.is_active ? 'Archive this customer?' : 'Reactivate this customer?'
            }
            variant="ghost"
            onSuccess={() => router.refresh()}
          />
          <ConfirmActionButton
            action={deleteCustomer}
            formData={{ id: customer.id }}
            label={t('sal.deleteCustomer')}
            confirmText="Delete this customer permanently? This only works if it has no sales order history."
            variant="ghost"
            onSuccess={() => router.refresh()}
          />
        </TableCell>
      )}
    </TableRow>
  );
}

export function CustomersManager({
  customers,
  canManage,
}: {
  customers: CustomerRow[];
  canManage: boolean;
}) {
  const { t } = useT();
  return (
    <div className="space-y-4">
      {canManage && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('sal.addCustomer')}</CardTitle>
          </CardHeader>
          <CardContent>
            <ActionForm action={createCustomer}>
              <CustomerFields />
              <SubmitButton>{t('sal.addCustomer')}</SubmitButton>
            </ActionForm>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('common.id')}</TableHead>
                <TableHead>{t('sal.customerName')}</TableHead>
                <TableHead>{t('sal.contactPerson')}</TableHead>
                <TableHead>{t('sal.phone')}</TableHead>
                <TableHead>{t('sal.defaultCurrency')}</TableHead>
                <TableHead>{t('common.status')}</TableHead>
                {canManage && <TableHead className="text-right">{t('common.actions')}</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {customers.map((c) => (
                <CustomerRowItem key={c.id} customer={c} canManage={canManage} />
              ))}
              {customers.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    {t('sal.noCustomers')}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
