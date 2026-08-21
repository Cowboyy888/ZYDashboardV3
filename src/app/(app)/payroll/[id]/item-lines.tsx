'use client';
import { useActionState, useEffect, useTransition } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { SubmitButton } from '@/components/forms/submit-button';
import { FormError } from '@/components/forms/form-error';
import { useT } from '@/components/i18n-provider';
import { addPayrollLine, removePayrollLine } from '@/lib/actions/payroll';
import { DEDUCTION_KINDS } from '@/lib/domain/payroll';
import type { ActionState } from '@/lib/actions/types';
import type { PayrollItemRow } from '@/lib/domain/payroll-view';

function RemoveLineButton({
  lineId,
  runId,
  onDone,
}: {
  lineId: string;
  runId: string;
  onDone: () => void;
}) {
  const [pending, start] = useTransition();
  function onClick() {
    start(async () => {
      const fd = new FormData();
      fd.set('lineId', lineId);
      fd.set('runId', runId);
      await removePayrollLine(null, fd);
      onDone();
    });
  }
  return (
    <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={onClick}>
      {pending ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Trash2 className="h-3.5 w-3.5" />
      )}
    </Button>
  );
}

export function ItemLines({
  runId,
  itemId,
  lines,
  onDone,
}: {
  runId: string;
  itemId: string;
  lines: PayrollItemRow['lines'];
  onDone: () => void;
}) {
  const { t } = useT();
  const [state, formAction, pending] = useActionState<ActionState, FormData>(addPayrollLine, null);

  useEffect(() => {
    if (state?.ok) onDone();
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-3 py-2">
      {lines.length > 0 && (
        <div className="space-y-1">
          {lines.map((l) => (
            <div key={l.lineId} className="flex items-center justify-between text-sm">
              <span>
                <span className="text-muted-foreground">
                  {l.kind === 'deduction' ? t('pay.deduction') : t('pay.advance')}:
                </span>{' '}
                {l.label}
              </span>
              <div className="flex items-center gap-2">
                <span className="tabular-nums">${l.amount.toFixed(2)}</span>
                <RemoveLineButton lineId={l.lineId} runId={runId} onDone={onDone} />
              </div>
            </div>
          ))}
        </div>
      )}
      <form action={formAction} className="grid gap-3 sm:grid-cols-4">
        <input type="hidden" name="itemId" value={itemId} />
        <div className="space-y-1.5">
          <Label htmlFor={`kind-${itemId}`}>{t('pay.lineKind')}</Label>
          <NativeSelect id={`kind-${itemId}`} name="kind" defaultValue="deduction">
            {DEDUCTION_KINDS.map((k) => (
              <option key={k} value={k}>
                {k === 'deduction' ? t('pay.deduction') : t('pay.advance')}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`label-${itemId}`}>{t('pay.lineLabel')}</Label>
          <Input
            id={`label-${itemId}`}
            name="label"
            required
            placeholder={t('pay.lineLabelPlaceholder')}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`amount-${itemId}`}>{t('pay.lineAmount')}</Label>
          <Input
            id={`amount-${itemId}`}
            name="amount"
            type="number"
            step="0.01"
            min="0.01"
            required
          />
        </div>
        <div className="flex items-end">
          <SubmitButton>{t('pay.addLine')}</SubmitButton>
        </div>
        <FormError error={state?.error} className="sm:col-span-4" />
      </form>
      {pending && <span className="sr-only">{t('pay.addLine')}</span>}
    </div>
  );
}
