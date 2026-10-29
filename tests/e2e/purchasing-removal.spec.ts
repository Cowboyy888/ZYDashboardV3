import { test, expect } from '@playwright/test';

test('dashboard has no purchasing links and retired endpoints return 404', async ({
  page,
  request,
}) => {
  await page.goto('/dashboard');
  await expect(page.locator('a[href^="/purchasing"]')).toHaveCount(0);
  for (const path of [
    '/purchasing',
    '/purchasing/orders',
    '/purchasing/suppliers',
    '/api/export/purchasing',
    '/api/purchasing/orders/00000000-0000-4000-8000-000000000001/pdf',
  ]) {
    expect((await request.get(path)).status()).toBe(404);
  }
});
