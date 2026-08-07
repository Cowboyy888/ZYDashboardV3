import { test, expect } from '@playwright/test';

/**
 * Purchasing critical flow: purchase orders are header records (supplier,
 * dates, currency, notes — no SKU/family catalog line items, no receiving;
 * see the separate test below for the free-text product lines they do
 * carry). Create one, edit it while Draft, issue it (and confirm editing is
 * no longer offered once issued), then confirm a separate draft can still
 * be cancelled.
 */
test('purchasing: create, edit, and issue a purchase order, cancel a separate draft', async ({
  page,
}) => {
  await page.goto('/purchasing/orders/new');

  // Header — first seeded supplier, today's order date is already defaulted.
  await page.locator('#supplierId').selectOption({ index: 1 });

  await page.getByRole('button', { name: /Create draft|创建草稿/ }).click();

  // Redirected to the new PO's detail page, still Draft.
  await page.waitForURL(/\/purchasing\/orders\/[0-9a-f-]+$/, { timeout: 15_000 });
  await expect(page.getByText(/^Draft$|^草稿$/).first()).toBeVisible();

  // Edit while Draft — change the supplier and add a note, confirm it saves.
  await page.getByRole('button', { name: /^Edit$|编辑/ }).click();
  await page.locator('#ep-supplier').selectOption({ index: 1 });
  await page.locator('#ep-notes').fill('Edited during e2e run');
  await page.getByRole('button', { name: /^Save$|保存/ }).click();
  await expect(page.getByText('Edited during e2e run')).toBeVisible();

  // Issue it — editing is no longer offered once it's no longer Draft.
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: /^Issue$|下单确认/ }).click();
  await expect(page.getByText(/^Ordered$|^已下单$/).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /^Edit$|编辑/ })).toHaveCount(0);

  // A second, separate draft PO can still be cancelled.
  await page.goto('/purchasing/orders/new');
  await page.locator('#supplierId').selectOption({ index: 1 });
  await page.getByRole('button', { name: /Create draft|创建草稿/ }).click();
  await page.waitForURL(/\/purchasing\/orders\/[0-9a-f-]+$/, { timeout: 15_000 });

  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: /^Cancel PO$|取消订单/ }).click();
  await expect(page.getByText(/^Cancelled$|^已取消$/).first()).toBeVisible();
});

/**
 * Manual product lines: free text, no SKU/family catalog connection at all.
 * Addable/removable regardless of PO status (unlike the header's commercial
 * terms, these never touch stock and aren't a binding commitment).
 */
test('purchasing: add and remove a free-text product line, survives Issue', async ({ page }) => {
  await page.goto('/purchasing/orders/new');
  await page.locator('#supplierId').selectOption({ index: 1 });
  await page.getByRole('button', { name: /Create draft|创建草稿/ }).click();
  await page.waitForURL(/\/purchasing\/orders\/[0-9a-f-]+$/, { timeout: 15_000 });

  // Add a product line — plain text, no dropdown.
  await page.getByRole('button', { name: /Add product|新增产品/ }).click();
  const dialog = page.getByRole('dialog');
  await dialog.locator('#pmi-name').fill('钢筋网 9厘 (manual, no SKU)');
  await dialog.locator('#pmi-qty').fill('50');
  await dialog.locator('#pmi-unit').fill('张');
  await dialog.locator('#pmi-price').fill('2.5');
  await dialog.getByRole('button', { name: /Add product|新增产品/ }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText('钢筋网 9厘 (manual, no SKU)')).toBeVisible();

  // Issuing the PO does not require or lock the product lines.
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: /^Issue$|下单确认/ }).click();
  await expect(page.getByText(/^Ordered$|^已下单$/).first()).toBeVisible();
  await expect(page.getByText('钢筋网 9厘 (manual, no SKU)')).toBeVisible();

  // Still removable after Issue.
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: /^Delete$|^删除$/ }).click();
  await expect(page.getByText('钢筋网 9厘 (manual, no SKU)')).toHaveCount(0);
});
