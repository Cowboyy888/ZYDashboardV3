'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useT } from '@/components/i18n-provider';
import { DeliverForm } from './deliver-form';

/**
 * Wraps DeliverForm in a proper dialog instead of an inline-expanding table
 * row — on a phone-width screen the line-items table needs horizontal
 * scroll, which used to bury the whole delivery form inside a scrolling
 * row; a dialog (full width up to max-w-lg) stays reachable and usable
 * regardless of table width.
 */
export function DeliverGoodsDialog({
  itemId,
  outstandingQty,
  unit,
  today,
  canOverride,
  onDelivered,
}: {
  itemId: string;
  outstandingQty: number;
  unit: string;
  today: string;
  canOverride: boolean;
  onDelivered: () => void;
}) {
  const { t } = useT();
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="outline">
          {t('sal.deliverGoods')}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('sal.deliverGoods')}</DialogTitle>
        </DialogHeader>
        <DeliverForm
          itemId={itemId}
          outstandingQty={outstandingQty}
          unit={unit}
          today={today}
          canOverride={canOverride}
          onDone={() => {
            setOpen(false);
            onDelivered();
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
