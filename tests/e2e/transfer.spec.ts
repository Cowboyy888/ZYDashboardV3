import { test, expect } from '@playwright/test';

/**
 * Stock transfer (Storage Room -> Warehouse). Verifies the transfer is recorded
 * and produces the matching transfer-out / transfer-in pair in the ledger — the
 * pair is what keeps the company total invariant (also covered by unit tests).
 */
test('inventory: transfer Storage Room -> Warehouse records a matched pair', async ({ page }) => {
  await page.goto('/inventory');
  await page.getByRole('tab', { name: 'Record' }).click();

  // First real SKU option (index 0 is the disabled "Select…" placeholder).
  await page.locator('#tr-sku').selectOption({ index: 1 });
  await page.locator('#tr-from').selectOption({ label: 'Storage Room 仓房' });
  await page.locator('#tr-to').selectOption({ label: 'Warehouse 仓库' });
  await page.locator('#tr-qty').fill('10');
  await page.getByRole('button', { name: 'Transfer', exact: true }).click();

  await expect(page.getByText(/Transfer recorded/i)).toBeVisible();

  // The ledger shows both legs of the transfer.
  await page.getByRole('tab', { name: 'Ledger' }).click();
  await expect(page.getByText('Transfer in', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Transfer out', { exact: true }).first()).toBeVisible();
});
