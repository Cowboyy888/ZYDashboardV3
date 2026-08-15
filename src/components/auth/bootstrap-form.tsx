'use client';
import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { bootstrapOwner, recordLoginEvent } from '@/lib/actions/auth';
import { useT } from '@/components/i18n-provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * First-Owner bootstrap. Calls the server action (which refuses once an Owner
 * exists), then signs in with the new credentials.
 */
export function BootstrapForm() {
  const { t } = useT();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const fd = new FormData();
      fd.set('fullName', fullName);
      fd.set('email', email);
      fd.set('password', password);
      const res = await bootstrapOwner(null, fd);
      if (!res?.ok) {
        setError(res?.error ?? 'Could not create the Owner account.');
        setPending(false);
        return;
      }
      const { createSupabaseBrowserClient } = await import('@/lib/supabase/client');
      const supabase = createSupabaseBrowserClient();
      const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
      if (signInErr) {
        setError(signInErr.message);
        setPending(false);
        return;
      }
      try {
        await recordLoginEvent();
      } catch (err) {
        console.error('[login] failed to record login event', err);
      }
      window.location.assign('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unexpected error');
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="fullName">{t('auth.name')}</Label>
        <Input
          id="fullName"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          required
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="email">{t('auth.email')}</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="password">{t('auth.password')}</Label>
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={8}
          required
        />
      </div>
      {error && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
      )}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending && <Loader2 className="h-4 w-4 animate-spin" />}
        {t('auth.createOwner')}
      </Button>
    </form>
  );
}
