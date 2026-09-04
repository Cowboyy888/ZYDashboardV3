import 'server-only';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/env';
import { hasPermission, isRole, type Permission, type Role } from '@/lib/domain/rbac';

export interface CurrentUser {
  id: string;
  email: string;
  fullName: string | null;
  role: Role;
  isActive: boolean;
  locale: string | null;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Resolve the signed-in user + their role from the profiles table.
 * Returns null when not signed in or when Supabase is not configured yet.
 *
 * Retries once, after a short pause, on a 401 from either call below —
 * Supabase has an ongoing, acknowledged platform incident (their status
 * page: "newly refreshed JWTs being rejected by the API, resulting in HTTP
 * 401 errors"; ap-southeast-1, this app's own region, is one of the
 * affected regions) where a perfectly valid session intermittently gets a
 * false 401. Their own guidance is "in most cases, waiting and refreshing
 * is successful." Without this, that upstream bug silently redirects a
 * legitimately signed-in user to /login (requireUser) or fails a server
 * action with "Not authenticated" (assertPermission) — not a real auth
 * problem, this exact one.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = await createSupabaseServerClient();

  let user = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const { data, error } = await supabase.auth.getUser();
    user = data.user;
    if (user || error?.status !== 401) break;
    await sleep(400);
  }
  if (!user) return null;

  let profile = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, email, full_name, role, is_active, locale')
      .eq('id', user.id)
      .single();
    profile = data;
    // PostgrestError has no HTTP status field, unlike AuthError above — but
    // this query can only fail for a user.id we just got from a genuinely
    // valid session, so any failure here is inherently suspicious and worth
    // one retry regardless of shape.
    if (profile || !error) break;
    await sleep(400);
  }

  if (!profile || !isRole(profile.role)) return null;

  return {
    id: profile.id,
    email: profile.email ?? user.email ?? '',
    fullName: profile.full_name,
    role: profile.role,
    isActive: profile.is_active,
    locale: profile.locale ?? null,
  };
}

/** Require a signed-in, active user or redirect to the login page. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user || !user.isActive) redirect('/login');
  return user;
}

/** Require a specific permission or redirect to the dashboard. */
export async function requirePermission(permission: Permission): Promise<CurrentUser> {
  const user = await requireUser();
  if (!hasPermission(user.role, permission)) redirect('/dashboard?denied=1');
  return user;
}

/** Non-redirecting guard for use inside server actions. */
export async function assertPermission(permission: Permission): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user || !user.isActive) throw new Error('Not authenticated');
  if (!hasPermission(user.role, permission)) {
    throw new Error(`Forbidden: missing permission ${permission}`);
  }
  return user;
}
