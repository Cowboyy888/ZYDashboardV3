'use client';
import { useActionState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SubmitButton } from '@/components/forms/submit-button';
import { AttachmentField } from '@/components/purchasing/attachment-field';
import { useT } from '@/components/i18n-provider';
import { deliverGoods } from '@/lib/actions/sales';
import type { ActionState } from '@/lib/actions/types';

export function DeliverForm({
  itemId,
  outstandingQty,
  unit,
  today,
  canOverride,
  onDone,
}: {
  itemId: string;
  outstandingQty: number;
  unit: string;
  today: string;
  canOverride: boolean;
  onDone: () => void;
}) {
  const { t, m } = useT();
  const [state, formAction] = useActionState<ActionState, FormData>(deliverGoods, null);

  // The server action revalidates this SO's path on success, which makes
  // Next.js re-render this route from the server regardless of anything done
  // here — so a lingering "success" message can't survive in this component.
  // Close on success and let the now-updated row (status/outstanding/delivery
  // history) be the visible confirmation.
  useEffect(() => {
    if (state?.ok) onDone();
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <form action={formAction} className="grid gap-3 py-2 sm:grid-cols-2 lg:grid-cols-4">
      <input type="hidden" name="itemId" value={itemId} />
      <div className="space-y-1.5">
        <Label htmlFor={`qty-${itemId}`}>
          {t('common.quantity')} ({t('sal.outstandingQty')}: {outstandingQty} {unit})
        </Label>
        <Input
          id={`qty-${itemId}`}
          name="quantity"
          type="number"
          step="0.001"
          min="0.001"
          required
          defaultValue={outstandingQty > 0 ? outstandingQty : undefined}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`date-${itemId}`}>{t('sal.deliveredDate')}</Label>
        <Input
          id={`date-${itemId}`}
          name="deliveredDate"
          type="date"
          defaultValue={today}
          required
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`batch-${itemId}`}>{t('sal.batchReference')}</Label>
        <Input id={`batch-${itemId}`} name="batchReference" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`notes-${itemId}`}>{t('common.notes')}</Label>
        <Input id={`notes-${itemId}`} name="notes" />
      </div>
      <div className="space-y-1.5">
        <Label>{t('sal.deliveryPhoto')}</Label>
        <AttachmentField name="attachmentPath" label={t('sal.deliveryPhoto')} folder="delivery" />
      </div>
      {canOverride && (
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor={`override-${itemId}`}>{t('sal.overrideLabel')}</Label>
          <Input
            id={`override-${itemId}`}
            name="overrideReason"
            placeholder={t('sal.overridePlaceholder')}
          />
        </div>
      )}
      {state?.error && (
        <p className="rounded-md bg-destructive/10 px-3 py-1.5 text-sm text-destructive sm:col-span-2 lg:col-span-4">
          {m(state.error)}
        </p>
      )}
      <div className="flex items-end gap-2">
        <SubmitButton>{t('sal.deliverGoods')}</SubmitButton>
        <button type="button" className="text-sm text-muted-foreground underline" onClick={onDone}>
          {t('common.cancel')}
        </button>
      </div>
    </form>
  );
}
