'use client';
import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { env } from '@/lib/env';
import { recordLoginEvent } from '@/lib/actions/auth';
import { useT } from '@/components/i18n-provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function CredentialForm({ mode }: { mode: 'signin' | 'signup' }) {
  const { t } = useT();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [errorNonce, setErrorNonce] = useState(0);
  const [pending, setPending] = useState(false);

  function fail(message: string) {
    setError(message);
    setErrorNonce((n) => n + 1);
    setPending(false);
  }

  const configured = !!env.supabaseUrl() && !!env.supabaseAnonKey();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!configured) {
      fail(t('auth.notConfigured'));
      return;
    }
    setPending(true);
    try {
      const { createSupabaseBrowserClient } = await import('@/lib/supabase/client');
      const supabase = createSupabaseBrowserClient();
      const result =
        mode === 'signin'
          ? await supabase.auth.signInWithPassword({ email, password })
          : await supabase.auth.signUp({
              email,
              password,
              options: { data: { full_name: fullName } },
            });
      if (result.error) {
        fail(result.error.message);
        return;
      }
      if (mode === 'signin') {
        try {
          await recordLoginEvent();
        } catch (err) {
          console.error('[login] failed to record login event', err);
        }
      }
      window.location.assign('/dashboard');
    } catch (err) {
      fail(err instanceof Error ? err.message : 'Unexpected error');
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {mode === 'signup' && (
        <div className="space-y-1.5">
          <Label htmlFor="fullName">{t('auth.name')}</Label>
          <Input
            id="fullName"
            className="transition-shadow duration-200 focus-visible:shadow-[0_0_0_4px_hsl(var(--primary)/0.15)]"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
          />
        </div>
      )}
      <div className="space-y-1.5">
        <Label htmlFor="email">{t('auth.email')}</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          className="transition-shadow duration-200 focus-visible:shadow-[0_0_0_4px_hsl(var(--primary)/0.15)]"
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
          autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
          className="transition-shadow duration-200 focus-visible:shadow-[0_0_0_4px_hsl(var(--primary)/0.15)]"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={8}
          required
        />
      </div>
      {error && (
        <p
          key={errorNonce}
          className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive motion-safe:animate-zy-shake"
        >
          {error}
        </p>
      )}
      <Button
        type="submit"
        className="w-full transition-all active:scale-[0.98]"
        disabled={pending}
      >
        {pending && <Loader2 className="h-4 w-4 animate-spin" />}
        {mode === 'signin' ? t('auth.signIn') : t('auth.createOwner')}
      </Button>
    </form>
  );
}
