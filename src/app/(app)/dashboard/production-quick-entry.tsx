'use client';
import { PackagePlus } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { ActionForm } from '@/components/forms/action-form';
import { SubmitButton } from '@/components/forms/submit-button';
import { useT } from '@/components/i18n-provider';
import { postMovement } from '@/lib/actions/inventory';

export function ProductionQuickEntry({
  skus,
  locationId,
  today,
}: {
  skus: { skuId: string; label: string }[];
  locationId: string;
  today: string;
}) {
  const { t } = useT();

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <PackagePlus className="h-4 w-4 text-primary" /> {t('dash.logProduction')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ActionForm action={postMovement} className="grid gap-3 sm:grid-cols-3 sm:items-end">
          <input type="hidden" name="type" value="production_output" />
          <input type="hidden" name="locationId" value={locationId} />
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="pq-sku">{t('inv.specification')}</Label>
            <NativeSelect id="pq-sku" name="skuId" required defaultValue="">
              <option value="" disabled>
                {t('common.select')}
              </option>
              {skus.map((s) => (
                <option key={s.skuId} value={s.skuId}>
                  {s.label}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pq-qty">{t('common.quantity')}</Label>
            <Input
              id="pq-qty"
              name="quantity"
              type="number"
              step="0.001"
              required
              placeholder="0"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pq-date">{t('common.date')}</Label>
            <Input id="pq-date" name="businessDate" type="date" defaultValue={today} required />
          </div>
          <div className="sm:col-span-3">
            <SubmitButton>{t('dash.logProduction')}</SubmitButton>
          </div>
        </ActionForm>
      </CardContent>
    </Card>
  );
}
