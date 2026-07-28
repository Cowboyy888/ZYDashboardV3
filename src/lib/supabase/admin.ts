import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { env } from '@/lib/env';

/**
 * Service-role Supabase client. BYPASSES RLS — use only in trusted server code
 * (scheduled cron jobs, admin bootstrap, report senders). Never import into a
 * client component. The service-role key is read lazily so build never fails.
 */
export function createSupabaseAdminClient() {
  return createClient(env.supabaseUrl(), env.supabaseServiceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
