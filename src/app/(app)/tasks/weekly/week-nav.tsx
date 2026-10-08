'use client';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { useT } from '@/components/i18n-provider';
import { addDays } from '@/lib/domain/datetime';

/** Prev/Next week nav for /tasks/weekly?date=YYYY-MM-DD (any date in the target week). */
export function WeekNav({ anchor }: { anchor: string }) {
  const router = useRouter();
  const { t } = useT();
  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={() => router.push(`/tasks/weekly?date=${addDays(anchor, -7)}`)}
      >
        {t('tasks.previousWeek')}
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={() => router.push(`/tasks/weekly?date=${addDays(anchor, 7)}`)}
      >
        {t('tasks.nextWeek')}
      </Button>
    </div>
  );
}
