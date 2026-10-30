import 'server-only';
import { cache } from 'react';
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
 * Memoized by React within each server-render request so the layout and page
 * share one verified user/profile lookup. No results are shared across users
 * or requests. Transient auth 401s and profile-query failures retry once,
 * waiting only between attempts (never after the final failure).
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  if (!isSupabaseConfigured()) return null;
  const supabase = await createSupabaseServerClient();

  let user = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const { data, error } = await supabase.auth.getUser();
    user = data.user;
    if (user || error?.status !== 401) break;
    if (attempt === 0) await sleep(400);
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
    if (attempt === 0) await sleep(400);
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
});

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
