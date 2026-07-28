'use client';
import { createBrowserClient } from '@supabase/ssr';
import { env } from '@/lib/env';

/**
 * Browser Supabase client. Created lazily inside components/handlers (never at
 * module scope) so a missing NEXT_PUBLIC config never breaks page hydration.
 */
export function createSupabaseBrowserClient() {
  return createBrowserClient(env.supabaseUrl(), env.supabaseAnonKey());
}
