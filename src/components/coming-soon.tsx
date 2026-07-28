'use client';
import { Construction } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { useT } from '@/components/i18n-provider';

export function ComingSoon({ title, passLabel }: { title: string; passLabel: string }) {
  const { t } = useT();
  return (
    <div>
      <PageHeader title={title} description={`${t('cs.comingSoon')} · ${passLabel}`} />
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Construction className="h-7 w-7" />
          </div>
          <div>
            <p className="text-lg font-semibold">{t('cs.comingSoon')}</p>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">
              {t('cs.scoped').replace('{pass}', passLabel)}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
