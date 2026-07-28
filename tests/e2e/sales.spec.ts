import { test, expect } from '@playwright/test';

/**
 * Sales (Third pass) critical flow: create a draft SO with one line item,
 * confirm it, then deliver a partial quantity — verifying the SO moves
 * Draft → Confirmed → Partially Delivered and the item shows both the
 * delivered and outstanding quantities.
 *
 * Delivery permanently consumes real stock from the shared local dev/test
 * database (the ledger is append-only — there is no "undo"). Other e2e specs
 * (e.g. transfer.spec.ts) depend on the same seeded SKU having a positive
 * balance, so this test tops that SKU's Storage Room stock up to a large
 * buffer via the Inventory "Edit amount" dialog before ordering/delivering,
 * rather than draining whatever happens to be left over from prior runs.
 */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

test('sales: create, confirm, and partially deliver a sales order', async ({ page }) => {
  await page.goto('/sales/orders/new');

  // First real SKU option (index 0 is the disabled "Select…" placeholder).
  const skuOption = page.getByTestId('so-item-sku').locator('option').nth(1);
  const skuLabel = (await skuOption.textContent())?.trim();
  expect(skuLabel).toBeTruthy();

  // Ensure this SKU has ample Storage Room stock before we deliver against it,
  // so this test never fights other specs over a shared, finite balance.
  await page.goto('/inventory');
  const stockRow = page.getByRole('row', { name: new RegExp(escapeRegExp(skuLabel!)) });
  await stockRow.getByRole('button', { name: /Edit amount|编辑数量/ }).click();
  const amountDialog = page.getByRole('dialog');
  await amountDialog.getByLabel(/Storage Room|仓房/).fill('1000');
  await amountDialog.getByRole('button', { name: /^(Save|保存)$/ }).click();
  await expect(amountDialog).toBeHidden();

  await page.goto('/sales/orders/new');

  // Header — first seeded customer, today's order date is already defaulted.
  await page.locator('#customerId').selectOption({ index: 1 });
  await page.locator('#expectedDeliveryDate').fill('2026-08-15');

  // One line item — same first real SKU/location option as above.
  await page.getByTestId('so-item-sku').selectOption({ index: 1 });
  await page.getByTestId('so-item-location').selectOption({ index: 1 });
  await page.getByTestId('so-item-qty').fill('100');
  await page.getByTestId('so-item-price').fill('5');

  await page.getByRole('button', { name: /Create draft|创建草稿/ }).click();

  // Redirected to the new SO's detail page, still Draft.
  await page.waitForURL(/\/sales\/orders\/[0-9a-f-]+$/, { timeout: 15_000 });
  await expect(page.getByText(/^Draft$|^草稿$/).first()).toBeVisible();

  // Confirm it.
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: /^Confirm$|确认订单/ }).click();
  await expect(page.getByText(/^Confirmed$|^已确认$/).first()).toBeVisible();

  // Deliver a partial quantity. The row's "Deliver goods" trigger button and
  // the form's submit button share the same label, so scope the submit click
  // to inside the <form> to avoid re-clicking the trigger.
  await page.getByRole('button', { name: /Deliver goods|发货/ }).click();
  const form = page.locator('form').filter({ has: page.locator('input[name="quantity"]') });
  await form.locator('input[name="quantity"]').fill('40');
  await form.locator('input[name="deliveredDate"]').fill('2026-07-26');
  await form.getByRole('button', { name: /Deliver goods|发货/ }).click();

  // The server action revalidates this page, so the form closes on success —
  // the confirmation is the now-updated status/quantities/delivery history,
  // not a lingering message (see deliver-form.tsx).
  await expect(page.getByText(/^Partially Delivered$|^部分发货$/).first()).toBeVisible();
  await expect(page.getByText('40 / 100', { exact: true })).toBeVisible();
  await expect(page.getByText('Outstanding: 60')).toBeVisible();
});
