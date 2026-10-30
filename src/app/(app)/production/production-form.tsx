'use client';
import { useActionState, useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useT } from '@/components/i18n-provider';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { NativeSelect } from '@/components/ui/native-select';
import { Button } from '@/components/ui/button';
import { AttachmentField } from '@/components/attachment-field';
import { FormError } from '@/components/forms/form-error';
import { saveProductionOrder, searchProductionReferences } from '@/lib/actions/production-orders';
import {
  PRODUCTION_PRIORITIES,
  type ProductionOrderRow,
  type ProductionReference,
  type ProductionReferenceKind,
} from '@/lib/domain/production-orders';

export type ProductionOptions = Record<ProductionReferenceKind, ProductionReference[]>;

function ReferenceField({
  kind,
  name,
  label,
  initial,
  value,
  selectedLabel,
  onChange,
}: {
  kind: ProductionReferenceKind;
  name: string;
  label: string;
  initial: ProductionReference[];
  value: string;
  selectedLabel?: string;
  onChange: (value: string, option?: ProductionReference) => void;
}) {
  const { t, m } = useT();
  const [options, setOptions] = useState(initial);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [pending, start] = useTransition();
  return (
    <div className="min-w-0 space-y-1.5">
      <Label htmlFor={`prod-${name}`}>{label}</Label>
      <div className="flex gap-2">
        <Input
          className="min-w-0"
          aria-label={`${t('production.search')} ${label}`}
          value={search}
          maxLength={80}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const result = await searchProductionReferences(kind, search);
              if (result.error) setError(result.error);
              else {
                setOptions(result.rows);
                setError('');
              }
            })
          }
        >
          {t('production.search')}
        </Button>
      </div>
      <NativeSelect
        className={kind === 'supervisors' ? 'font-khmer' : undefined}
        id={`prod-${name}`}
        name={name}
        value={value}
        onChange={(e) =>
          onChange(
            e.target.value,
            options.find((o) => o.id === e.target.value),
          )
        }
      >
        <option value="">{t('common.select')}</option>
        {value && !options.some((o) => o.id === value) && (
          <option value={value}>{selectedLabel ?? value}</option>
        )}
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </NativeSelect>
      {error && <p className="text-sm text-destructive">{m(error)}</p>}
    </div>
  );
}

export function ProductionForm({
  id,
  today,
  row,
  options,
}: {
  id: string;
  today: string;
  row?: ProductionOrderRow;
  options: ProductionOptions;
}) {
  const { t, m } = useT();
  const router = useRouter();
  const [state, action, pending] = useActionState(saveProductionOrder, null);
  const [requestId] = useState(id);
  const [uploadPending, setUploadPending] = useState(false);
  const fieldLabels: Record<string, string> = {
    skuId: t('production.sku'),
    drawingId: t('production.drawing'),
    salesOrderItemId: t('production.salesLine'),
    internalReason: t('production.internalReason'),
    plannedQuantity: t('production.quantity'),
    requiredDate: t('production.required'),
    priority: t('production.priority'),
    plannedLine: t('production.line'),
    supervisorId: t('production.supervisor'),
    notes: t('production.notes'),
    attachmentPath: t('production.attachment'),
  };
  const [source, setSource] = useState(row?.sales_order_item_id ?? '');
  const [sku, setSku] = useState(row?.sku_id ?? '');
  const [skuLabel, setSkuLabel] = useState(row?.sku_label ?? '');
  const [drawing, setDrawing] = useState(row?.drawing_id ?? '');
  const [supervisor, setSupervisor] = useState(row?.supervisor_id ?? '');
  useEffect(() => {
    if (state?.ok && typeof state.data?.id === 'string') {
      router.push(`/production/${state.data.id}`);
      router.refresh();
    }
  }, [state, router]);
  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="id" value={requestId} />
      <input type="hidden" name="version" value={row?.version ?? 0} />
      <input type="hidden" name="businessDate" value={row?.business_date ?? today} />
      <p className="text-sm text-muted-foreground">{t('production.formHint')}</p>
      <div className="grid gap-4 md:grid-cols-2">
        <ReferenceField
          kind="sales_items"
          name="salesOrderItemId"
          label={t('production.salesLine')}
          initial={options.sales_items}
          value={source}
          selectedLabel={row?.sales_order_number ?? ''}
          onChange={(value, option) => {
            setSource(value);
            if (option?.sku_id) {
              setSku(option.sku_id);
              setSkuLabel(option.sku_label ?? '');
            }
          }}
        />
        {!source && (
          <div className="space-y-1.5">
            <Label htmlFor="prod-internalReason">{t('production.internalReason')}</Label>
            <Textarea
              id="prod-internalReason"
              name="internalReason"
              maxLength={500}
              required
              defaultValue={row?.internal_reason ?? ''}
            />
          </div>
        )}
        <ReferenceField
          kind="skus"
          name="skuId"
          label={t('production.sku')}
          initial={options.skus}
          value={sku}
          selectedLabel={skuLabel}
          onChange={(v, o) => {
            setSku(v);
            setSkuLabel(o?.label ?? '');
          }}
        />
        <ReferenceField
          kind="drawings"
          name="drawingId"
          label={t('production.drawing')}
          initial={options.drawings}
          value={drawing}
          selectedLabel={row?.geometry.meshSpecification}
          onChange={setDrawing}
        />
        <div className="space-y-1.5">
          <Label htmlFor="prod-quantity">{t('production.quantity')}</Label>
          <Input
            id="prod-quantity"
            name="plannedQuantity"
            type="number"
            min={1}
            max={1000000}
            step={1}
            required
            defaultValue={row?.planned_quantity ?? 1}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="prod-required">{t('production.required')}</Label>
          <Input
            id="prod-required"
            name="requiredDate"
            type="date"
            required
            min={row?.business_date ?? today}
            defaultValue={row?.required_date ?? today}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="prod-priority">{t('production.priority')}</Label>
          <NativeSelect id="prod-priority" name="priority" defaultValue={row?.priority ?? 'normal'}>
            {PRODUCTION_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {t(`production.priority.${p}`)}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="prod-line">{t('production.line')}</Label>
          <Input
            id="prod-line"
            name="plannedLine"
            maxLength={120}
            defaultValue={row?.planned_line ?? ''}
          />
        </div>
        <ReferenceField
          kind="supervisors"
          name="supervisorId"
          label={t('production.supervisor')}
          initial={options.supervisors}
          value={supervisor}
          selectedLabel={row?.supervisor_name ?? ''}
          onChange={setSupervisor}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="prod-notes">{t('production.notes')}</Label>
        <Textarea id="prod-notes" name="notes" maxLength={4000} defaultValue={row?.notes ?? ''} />
      </div>
      <AttachmentField
        name="attachmentPath"
        label={t('production.attachment')}
        folder={`production/${requestId}`}
        initialPath={row?.attachment_path}
        onPendingChange={setUploadPending}
      />
      {state?.fieldErrors && (
        <ul className="text-sm text-destructive" role="alert">
          {Object.entries(state.fieldErrors).map(([field, error]) => (
            <li key={field}>
              {fieldLabels[field] ?? t('production.title')}: {m(error)}
            </li>
          ))}
        </ul>
      )}
      <FormError error={state?.error} />
      <Button type="submit" disabled={pending || uploadPending}>
        {t('common.save')}
      </Button>
    </form>
  );
}
