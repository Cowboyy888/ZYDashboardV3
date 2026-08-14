'use client';
import { useState, useTransition } from 'react';
import { Loader2, Paperclip } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Uploads a file to the shared private `attachments` bucket immediately on
 * selection and stores the resulting path in a hidden field, so it can ride
 * along with a form whose parent record (PO / receipt) doesn't exist yet.
 */
export function AttachmentField({
  name,
  label,
  folder,
}: {
  name: string;
  label: string;
  folder: string;
}) {
  const [pending, start] = useTransition();
  const [path, setPath] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    start(async () => {
      try {
        const { createSupabaseBrowserClient } = await import('@/lib/supabase/client');
        const supabase = createSupabaseBrowserClient();
        const ext = file.name.split('.').pop() || 'bin';
        const objectPath = `${folder}/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from('attachments')
          .upload(objectPath, file, { upsert: true, contentType: file.type });
        if (upErr) {
          setError(upErr.message);
          return;
        }
        setPath(objectPath);
        setFileName(file.name);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Upload failed');
      }
    });
  }

  return (
    <div className="space-y-1">
      <input type="hidden" name={name} value={path ?? ''} />
      <Button asChild variant="outline" size="sm" type="button" disabled={pending}>
        <label className="cursor-pointer">
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Paperclip className="h-4 w-4" />
          )}
          {fileName ?? label}
          <input type="file" className="hidden" onChange={onFile} disabled={pending} />
        </label>
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
