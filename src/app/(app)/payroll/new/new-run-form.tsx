'use client';
import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useT } from '@/components/i18n-provider';
import { createDraftPayrollRun } from '@/lib/actions/payroll';
import type { ActionState } from '@/lib/actions/types';

export function NewRunForm({
  defaults,
}: {
  defaults: { periodStart: string; periodEnd: string; payDate: string };
}) {
  const { t, m } = useT();
  const router = useRouter();
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    createDraftPayrollRun,
    null,
  );

  useEffect(() => {
    if (state?.ok && state.data?.id) {
      router.push(`/payroll/${state.data.id}`);
    }
  }, [state, router]);

  return (
    <form action={formAction} className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('pay.newRun')}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="periodStart">{t('pay.periodStart')}</Label>
            <Input
              id="periodStart"
              name="periodStart"
              type="date"
              defaultValue={defaults.periodStart}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="periodEnd">{t('pay.periodEnd')}</Label>
            <Input
              id="periodEnd"
              name="periodEnd"
              type="date"
              defaultValue={defaults.periodEnd}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="payDate">{t('pay.payDate')}</Label>
            <Input
              id="payDate"
              name="payDate"
              type="date"
              defaultValue={defaults.payDate}
              required
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="notes">{t('common.notes')}</Label>
            <Input id="notes" name="notes" />
          </div>
          <p className="text-xs text-muted-foreground sm:col-span-2">{t('pay.newRunHint')}</p>
          {state?.error && (
            <p className="rounded-md bg-destructive/10 px-3 py-1.5 text-sm text-destructive sm:col-span-2">
              {m(state.error)}
            </p>
          )}
          <Button type="submit" disabled={isPending} className="sm:col-span-2 sm:w-fit">
            {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {t('pay.generateDraft')}
          </Button>
        </CardContent>
      </Card>
    </form>
  );
}
