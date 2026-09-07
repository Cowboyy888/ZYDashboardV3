'use client';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ActionForm } from '@/components/forms/action-form';
import { SubmitButton } from '@/components/forms/submit-button';
import { useT } from '@/components/i18n-provider';
import { createPriceType, togglePriceType } from '@/lib/actions/price-records';
import type { PriceTypeRow } from '@/lib/db/types';

export function PriceTypesManager({ priceTypes }: { priceTypes: PriceTypeRow[] }) {
  const { t } = useT();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('pr.priceTypes')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <ActionForm action={createPriceType} className="flex items-end gap-2">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="pt-name">{t('common.name')}</Label>
            <Input id="pt-name" name="name" placeholder="Special Price" required />
          </div>
          <SubmitButton>{t('common.add')}</SubmitButton>
        </ActionForm>
        <div className="divide-y rounded-md border">
          {priceTypes.map((pt) => (
            <div key={pt.id} className="flex items-center justify-between px-3 py-2 text-sm">
              <span className={pt.is_active ? '' : 'text-muted-foreground line-through'}>
                {pt.name}
              </span>
              <ActionForm action={togglePriceType} className="space-y-0">
                <input type="hidden" name="id" value={pt.id} />
                <input type="hidden" name="isActive" value={String(pt.is_active)} />
                <SubmitButton variant="ghost" size="sm">
                  {pt.is_active ? t('common.archive') : t('common.reactivate')}
                </SubmitButton>
              </ActionForm>
            </div>
          ))}
          {priceTypes.length === 0 && (
            <div className="px-3 py-4 text-center text-sm text-muted-foreground">
              {t('pr.noPriceTypes')}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
