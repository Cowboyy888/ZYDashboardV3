import { test, expect } from '@playwright/test';

/**
 * Purchasing critical flow: purchase orders are header-only records (no line
 * items, no receiving). Create one, issue it, then confirm a separate draft
 * can still be cancelled.
 */
test('purchasing: create and issue a purchase order, cancel a separate draft', async ({ page }) => {
  await page.goto('/purchasing/orders/new');

  // Header — first seeded supplier, today's order date is already defaulted.
  await page.locator('#supplierId').selectOption({ index: 1 });
  await page.locator('#expectedArrivalDate').fill('2026-08-15');

  await page.getByRole('button', { name: /Create draft|创建草稿/ }).click();

  // Redirected to the new PO's detail page, still Draft.
  await page.waitForURL(/\/purchasing\/orders\/[0-9a-f-]+$/, { timeout: 15_000 });
  await expect(page.getByText(/^Draft$|^草稿$/).first()).toBeVisible();

  // Issue it.
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: /^Issue$|下单确认/ }).click();
  await expect(page.getByText(/^Ordered$|^已下单$/).first()).toBeVisible();

  // A second, separate draft PO can still be cancelled.
  await page.goto('/purchasing/orders/new');
  await page.locator('#supplierId').selectOption({ index: 1 });
  await page.getByRole('button', { name: /Create draft|创建草稿/ }).click();
  await page.waitForURL(/\/purchasing\/orders\/[0-9a-f-]+$/, { timeout: 15_000 });

  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: /^Cancel PO$|取消订单/ }).click();
  await expect(page.getByText(/^Cancelled$|^已取消$/).first()).toBeVisible();
});
