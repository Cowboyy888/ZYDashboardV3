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

/**
 * Resolve the signed-in user + their role from the profiles table.
 * Returns null when not signed in or when Supabase is not configured yet.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, email, full_name, role, is_active, locale')
    .eq('id', user.id)
    .single();

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
