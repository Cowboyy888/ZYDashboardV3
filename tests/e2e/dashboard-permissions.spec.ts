import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { translator } from '../../src/lib/i18n';

test.use({ storageState: { cookies: [], origins: [] } });

const roles = [
  { role: 'owner', attendance: true, inventory: true, sales: true, payroll: true },
  { role: 'system_admin', attendance: true, inventory: true, sales: true, payroll: true },
  { role: 'attendance_admin', attendance: true, inventory: false, sales: false, payroll: false },
  { role: 'warehouse_admin', attendance: false, inventory: true, sales: false, payroll: false },
  { role: 'sales_admin', attendance: false, inventory: true, sales: true, payroll: false },
  { role: 'marketing_admin', attendance: false, inventory: false, sales: false, payroll: false },
  { role: 'payroll_admin', attendance: true, inventory: false, sales: false, payroll: true },
  { role: 'viewer', attendance: true, inventory: true, sales: false, payroll: false },
];

for (const access of roles) {
  test(`${access.role} dashboard displays only permitted sections`, async ({ page }) => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    test.skip(
      !url || !['127.0.0.1', 'localhost'].includes(new URL(url).hostname),
      'Creates role fixtures only in disposable local Supabase.',
    );
    const admin = createClient(url!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const email = `dashboard-${randomUUID()}@zysteel.local`;
    const password = `Dashboard-test-${randomUUID()}`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    expect(error).toBeNull();
    expect(data.user).toBeTruthy();
    const profile = await admin
      .from('profiles')
      .update({
        role: access.role,
        is_active: true,
        locale: 'en',
      })
      .eq('id', data.user!.id)
      .select('id')
      .single();
    expect(profile.error).toBeNull();

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/login');
    await page.locator('#email').fill(email);
    await page.locator('#password').fill(password);
    await page.getByRole('button', { name: /Sign in|登录/ }).click();
    await page.waitForURL('**/dashboard');
    const t = translator('en');
    for (const [allowed, label] of [
      [access.attendance, 'dash.morningAtt'],
      [access.attendance, 'dash.attExceptions'],
      [access.inventory, 'dash.inventoryTotals'],
      [access.inventory, 'dash.lowStock'],
      [access.inventory, 'dash.productionToday'],
      [access.sales, 'dash.salesToday'],
      [access.payroll, 'dash.payrollApprovals'],
    ] as const) {
      const section = page.getByText(t(label), { exact: true });
      if (allowed) await expect(section).toBeVisible();
      else await expect(section).toHaveCount(0);
    }
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  });
}
