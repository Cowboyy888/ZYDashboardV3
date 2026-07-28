import { chromium, type FullConfig } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export const STORAGE_STATE = 'tests/e2e/.auth/owner.json';
const EMAIL = process.env.E2E_OWNER_EMAIL ?? 'e2e-owner@zysteel.local';
const PASSWORD = process.env.E2E_OWNER_PASSWORD ?? 'e2e-owner-password-123';

/**
 * Global setup for the DB-backed e2e suite:
 *  1. Ensure a test Owner exists (create via admin API, force role = owner).
 *  2. Sign in through the real login page and persist the auth cookies as
 *     storageState, so the authenticated specs start logged in.
 *
 * Requires a running local Supabase (NEXT_PUBLIC_SUPABASE_URL,
 * NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY). verify.mjs only
 * runs this suite when those are present + reachable.
 */
export default async function globalSetup(config: FullConfig) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const baseURL = config.projects[0]?.use?.baseURL ?? 'http://localhost:3000';

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 1. Ensure the owner account exists.
  const created = await admin.auth.admin.createUser({
    email: EMAIL,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: 'E2E Owner' },
  });
  let userId = created.data.user?.id;
  if (!userId) {
    // Already exists — find it.
    const { data } = await admin.auth.admin.listUsers();
    userId = data.users.find((u) => u.email === EMAIL)?.id;
  }
  if (userId) {
    await admin.from('profiles').update({ role: 'owner', full_name: 'E2E Owner' }).eq('id', userId);
  }

  // 2. Log in through the UI and save cookies.
  mkdirSync(dirname(STORAGE_STATE), { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(`${baseURL}/login`);
  await page.fill('#email', EMAIL);
  await page.fill('#password', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dashboard', { timeout: 30_000 });
  await page.context().storageState({ path: STORAGE_STATE });
  await browser.close();
}
