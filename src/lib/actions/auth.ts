'use server';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { fail, ok, type ActionState } from './types';

/** Sign the current user out and return to the login page. */
export async function signOutAction() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect('/login');
}

const bootstrapSchema = z.object({
  fullName: z.string().trim().min(1, 'Name is required'),
  email: z.string().email(),
  password: z.string().min(8, 'At least 8 characters'),
});

/**
 * Create the very first Owner. Allowed ONLY while no Owner exists; once one does,
 * this permanently refuses. Uses the service-role admin API (public self-signup
 * is disabled), and the DB trigger promotes the first profile to Owner.
 */
export async function bootstrapOwner(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = bootstrapSchema.safeParse({
    fullName: formData.get('fullName'),
    email: formData.get('email'),
    password: formData.get('password'),
  });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Invalid input');

  let admin;
  try {
    admin = createSupabaseAdminClient();
  } catch {
    return fail('Server is not configured. Set SUPABASE_SERVICE_ROLE_KEY in .env.local.');
  }

  const { data: exists, error: rpcErr } = await admin.rpc('owner_exists');
  if (rpcErr) return fail(rpcErr.message);
  if (exists === true) {
    return fail('An Owner already exists. Ask an administrator to add your account.');
  }

  const { error } = await admin.auth.admin.createUser({
    email: parsed.data.email,
    password: parsed.data.password,
    email_confirm: true,
    user_metadata: { full_name: parsed.data.fullName },
  });
  if (error) return fail(error.message);

  return ok('Owner account created');
}
