'use client';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useT } from '@/components/i18n-provider';

/** Date picker that navigates to /attendance?date=YYYY-MM-DD. */
export function DateNav({ date }: { date: string }) {
  const router = useRouter();
  const { t } = useT();
  return (
    <div className="flex items-center gap-2">
      <Label htmlFor="att-date" className="text-sm text-muted-foreground">
        {t('att.date')}
      </Label>
      <Input
        id="att-date"
        type="date"
        defaultValue={date}
        className="h-9 w-40"
        onChange={(e) => {
          if (e.target.value) router.push(`/attendance?date=${e.target.value}`);
        }}
      />
    </div>
  );
}
