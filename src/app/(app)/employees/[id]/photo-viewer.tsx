'use client';
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useT } from '@/components/i18n-provider';

/** Clickable employee photo thumbnail that opens a full-size view. */
export function PhotoViewer({ photoUrl, name }: { photoUrl: string; name: string }) {
  const { t } = useT();
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className="h-16 w-16 shrink-0 overflow-hidden rounded-full ring-offset-2 transition hover:ring-2 hover:ring-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          aria-label={t('emp.viewPhoto')}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photoUrl} alt="" className="h-full w-full object-cover" />
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogTitle>{name}</DialogTitle>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photoUrl} alt={name} className="max-h-[70vh] w-full rounded-md object-contain" />
      </DialogContent>
    </Dialog>
  );
}
