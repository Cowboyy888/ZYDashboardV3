'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useT } from '@/components/i18n-provider';
import { setEmployeePhoto } from '@/lib/actions/employees';

/** Uploads a private photo to the employee-photos bucket, then records the path. */
export function PhotoUpload({ employeeId }: { employeeId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const { t } = useT();

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    start(async () => {
      try {
        const { createSupabaseBrowserClient } = await import('@/lib/supabase/client');
        const supabase = createSupabaseBrowserClient();
        const ext = file.name.split('.').pop() || 'jpg';
        const path = `${employeeId}/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from('employee-photos')
          .upload(path, file, { upsert: true, contentType: file.type });
        if (upErr) {
          setError(upErr.message);
          return;
        }
        const fd = new FormData();
        fd.set('employeeId', employeeId);
        fd.set('path', path);
        const res = await setEmployeePhoto(null, fd);
        if (res && !res.ok) setError(res.error ?? 'Failed to save');
        else router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Upload failed');
      }
    });
  }

  return (
    <div className="space-y-1">
      <Button asChild variant="outline" size="sm" disabled={pending}>
        <label className="cursor-pointer">
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {t('emp.uploadPhoto')}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={onFile}
            disabled={pending}
          />
        </label>
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
