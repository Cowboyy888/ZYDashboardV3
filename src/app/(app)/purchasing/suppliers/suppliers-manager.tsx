'use client';
import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { useT } from '@/components/i18n-provider';
import {
  createSupplier,
  updateSupplier,
  toggleSupplier,
  deleteSupplier,
} from '@/lib/actions/purchasing';
import { CURRENCIES } from '@/lib/domain/purchasing';
import type { ActionState } from '@/lib/actions/types';
import type { SupplierRow } from '@/lib/db/types';

const selectCls =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

function SupplierFields({ defaults }: { defaults?: SupplierRow }) {
  const { t } = useT();
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="name">{t('pur.supplierName')}</Label>
          <Input id="name" name="name" required defaultValue={defaults?.name} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="defaultCurrency">{t('pur.defaultCurrency')}</Label>
          <select
            id="defaultCurrency"
            name="defaultCurrency"
            className={selectCls}
            defaultValue={defaults?.default_currency ?? 'USD'}
          >
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="nameChinese">{t('pur.nameChinese')}</Label>
          <Input id="nameChinese" name="nameChinese" defaultValue={defaults?.name_chinese ?? ''} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="nameEnglish">{t('pur.nameEnglish')}</Label>
          <Input id="nameEnglish" name="nameEnglish" defaultValue={defaults?.name_english ?? ''} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="contactPerson">{t('pur.contactPerson')}</Label>
          <Input
            id="contactPerson"
            name="contactPerson"
            defaultValue={defaults?.contact_person ?? ''}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="phone">{t('pur.phone')}</Label>
          <Input id="phone" name="phone" defaultValue={defaults?.phone ?? ''} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="address">{t('pur.address')}</Label>
          <Input id="address" name="address" defaultValue={defaults?.address ?? ''} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="taxId">{t('pur.taxId')}</Label>
          <Input id="taxId" name="taxId" defaultValue={defaults?.tax_id ?? ''} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="paymentTerms">{t('pur.paymentTerms')}</Label>
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

function EditSupplierRow({ supplier, onDone }: { supplier: SupplierRow; onDone: () => void }) {
  const { t, m } = useT();
  const [state, formAction, pending] = useActionState<ActionState, FormData>(updateSupplier, null);

  useEffect(() => {
    if (state?.ok) onDone();
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <TableRow>
      <TableCell colSpan={6} className="bg-muted/30">
        <form action={formAction} className="space-y-3 py-2">
          <input type="hidden" name="id" value={supplier.id} />
          <SupplierFields defaults={supplier} />
          {state?.error && (
            <p className="rounded-md bg-destructive/10 px-3 py-1.5 text-sm text-destructive">
              {m(state.error)}
            </p>
          )}
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

function SupplierRowItem({ supplier, canManage }: { supplier: SupplierRow; canManage: boolean }) {
  const { t } = useT();
  const router = useRouter();
  const [editing, setEditing] = useState(false);

  if (editing) {
    return <EditSupplierRow supplier={supplier} onDone={() => setEditing(false)} />;
  }

  return (
    <TableRow>
      <TableCell className="font-medium">
        {supplier.name}
        {supplier.name_chinese && (
          <span className="ml-2 text-muted-foreground">{supplier.name_chinese}</span>
        )}
      </TableCell>
      <TableCell>{supplier.contact_person || '—'}</TableCell>
      <TableCell>{supplier.phone || '—'}</TableCell>
      <TableCell>{supplier.default_currency}</TableCell>
      <TableCell>
        {supplier.is_active ? (
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
            action={toggleSupplier}
            formData={{ id: supplier.id, isActive: String(supplier.is_active) }}
            label={supplier.is_active ? t('common.archive') : t('common.reactivate')}
            confirmText={
              supplier.is_active ? 'Archive this supplier?' : 'Reactivate this supplier?'
            }
            variant="ghost"
            onSuccess={() => router.refresh()}
          />
          <ConfirmActionButton
            action={deleteSupplier}
            formData={{ id: supplier.id }}
            label={t('pur.deleteSupplier')}
            confirmText="Delete this supplier permanently? This only works if it has no purchase order history."
            variant="ghost"
            onSuccess={() => router.refresh()}
          />
        </TableCell>
      )}
    </TableRow>
  );
}

export function SuppliersManager({
  suppliers,
  canManage,
}: {
  suppliers: SupplierRow[];
  canManage: boolean;
}) {
  const { t } = useT();
  return (
    <div className="space-y-4">
      {canManage && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('pur.addSupplier')}</CardTitle>
          </CardHeader>
          <CardContent>
            <ActionForm action={createSupplier}>
              <SupplierFields />
              <SubmitButton>{t('pur.addSupplier')}</SubmitButton>
            </ActionForm>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('pur.supplierName')}</TableHead>
                <TableHead>{t('pur.contactPerson')}</TableHead>
                <TableHead>{t('pur.phone')}</TableHead>
                <TableHead>{t('pur.defaultCurrency')}</TableHead>
                <TableHead>{t('common.status')}</TableHead>
                {canManage && <TableHead className="text-right">{t('common.actions')}</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {suppliers.map((s) => (
                <SupplierRowItem key={s.id} supplier={s} canManage={canManage} />
              ))}
              {suppliers.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    {t('pur.noSuppliers')}
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
