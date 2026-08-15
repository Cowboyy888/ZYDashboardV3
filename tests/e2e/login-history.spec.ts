import { test, expect } from '@playwright/test';

const EMAIL = process.env.E2E_OWNER_EMAIL ?? 'e2e-owner@zysteel.local';

/**
 * global-setup.ts signs in through the real /login page before every e2e run,
 * which (via recordLoginEvent) inserts a login_events row for the Owner
 * account — this test just confirms that row surfaces on the settings page.
 * IP/country are intentionally not asserted: Vercel's geo headers are absent
 * locally/CI, so those fields are expected to render as blank there.
 */
test('login history shows the sign-in from global setup', async ({ page }) => {
  await page.goto('/settings/logins');
  await expect(page.getByText(EMAIL).first()).toBeVisible();
});
