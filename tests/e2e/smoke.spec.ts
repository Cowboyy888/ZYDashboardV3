import { test, expect } from '@playwright/test';

/**
 * Unauthenticated smoke flows. These run WITHOUT the shared Owner storageState
 * (cleared below) so they can assert the logged-out routing + login/setup pages.
 */
test.use({ storageState: { cookies: [], origins: [] } });

test('unauthenticated visitors are routed to the login page', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByText(/Sign in/i).first()).toBeVisible();
});

test('login page shows the Zysteel brand and a link to Owner setup', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByText('中粤铁网').first()).toBeVisible();
  await expect(page.getByRole('link', { name: /Set up the Owner account/i })).toBeVisible();
});
