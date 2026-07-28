import { test, expect } from '@playwright/test';

/**
 * Purchasing (Second pass) critical flow: create a draft PO with one line
 * item, issue it, then receive a partial quantity — verifying the PO moves
 * Draft → Ordered → Partially Received and the item shows both the received
 * and outstanding quantities.
 */
test('purchasing: create, issue, and partially receive a purchase order', async ({ page }) => {
  await page.goto('/purchasing/orders/new');

  // Header — first seeded supplier, today's order date is already defaulted.
  await page.locator('#supplierId').selectOption({ index: 1 });
  await page.locator('#expectedArrivalDate').fill('2026-08-15');

  // One line item — first real SKU/location option (index 0 is the "Select…" placeholder).
  await page.getByTestId('po-item-sku').selectOption({ index: 1 });
  await page.getByTestId('po-item-location').selectOption({ index: 1 });
  await page.getByTestId('po-item-qty').fill('100');
  await page.getByTestId('po-item-cost').fill('5');

  await page.getByRole('button', { name: /Create draft|创建草稿/ }).click();

  // Redirected to the new PO's detail page, still Draft.
  await page.waitForURL(/\/purchasing\/orders\/[0-9a-f-]+$/, { timeout: 15_000 });
  await expect(page.getByText(/^Draft$|^草稿$/).first()).toBeVisible();

  // Issue it.
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: /^Issue$|下单确认/ }).click();
  await expect(page.getByText(/^Ordered$|^已下单$/).first()).toBeVisible();

  // Receive a partial quantity. The row's "Receive goods" trigger button and
  // the form's submit button share the same label, so scope the submit click
  // to inside the <form> to avoid re-clicking the trigger.
  await page.getByRole('button', { name: /Receive goods|收货/ }).click();
  const form = page.locator('form').filter({ has: page.locator('input[name="quantity"]') });
  await form.locator('input[name="quantity"]').fill('40');
  await form.locator('input[name="receivedDate"]').fill('2026-07-26');
  await form.getByRole('button', { name: /Receive goods|收货/ }).click();

  // The server action revalidates this page, so the form closes on success —
  // the confirmation is the now-updated status/quantities/receipt history,
  // not a lingering message (see receive-form.tsx).
  await expect(page.getByText(/^Partially Received$|^部分收货$/).first()).toBeVisible();
  await expect(page.getByText('40 / 100', { exact: true })).toBeVisible();
  await expect(page.getByText('Outstanding: 60')).toBeVisible();
});
