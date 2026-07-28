import { test, expect } from '@playwright/test';

/**
 * Inventory → Stock tab: Add / Edit / Delete specification (SKU) buttons (Owner).
 * Mirrors the existing Settings → Products flow (tests/e2e/product-family.spec.ts)
 * but exercises the shortcut controls surfaced directly on the Inventory page.
 */

test('add a specification from the Inventory page, edit it, then permanently delete it', async ({
  page,
}) => {
  await page.goto('/inventory');
  await page.getByRole('button', { name: /^(Add specification|新增规格)$/ }).click();

  const marker = `E2E-${Date.now()}`;
  await page.selectOption('#inv-sku-family', { index: 1 });
  await page.fill('#inv-sku-dia', marker);
  await page.getByRole('button', { name: /^(Save|保存)$/ }).click();

  const row = page.getByRole('row', { name: new RegExp(marker) });
  await expect(row).toBeVisible();

  // Edit: change the diameter to a new marker and confirm the row updates.
  // Exact match — a row also has an "Edit amount" button, which also contains "Edit".
  await row.getByRole('button', { name: /^(Edit|编辑)$/ }).click();
  const editedMarker = `${marker}-edited`;
  const dialog = page.getByRole('dialog');
  await dialog.locator('input[name="diameter"]').fill(editedMarker);
  await dialog.getByRole('button', { name: /^(Save|保存)$/ }).click();
  await expect(dialog).toBeHidden();

  const editedRow = page.getByRole('row', { name: new RegExp(editedMarker) });
  await expect(editedRow).toBeVisible();
  await expect(page.getByRole('row', { name: new RegExp(`${marker}$`) })).toHaveCount(0);

  page.once('dialog', (d) => d.accept());
  await editedRow.getByRole('button', { name: /Delete|删除/ }).click();

  await expect(page.getByText(editedMarker)).toHaveCount(0);
});

test('edit amount: the quick "set new total" dialog posts an adjustment and updates the row', async ({
  page,
}) => {
  await page.goto('/inventory');
  await page.getByRole('button', { name: /^(Add specification|新增规格)$/ }).click();

  const marker = `E2E-${Date.now()}`;
  await page.selectOption('#inv-sku-family', { index: 1 });
  await page.fill('#inv-sku-dia', marker);
  await page.getByRole('button', { name: /^(Save|保存)$/ }).click();

  const row = page.getByRole('row', { name: new RegExp(marker) });
  await expect(row).toBeVisible();
  // A brand-new spec starts at 0 in both locations.
  await expect(row.locator('td').nth(1)).toHaveText('0');

  await row.getByRole('button', { name: /Edit amount|编辑数量/ }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(/Storage Room|仓房/).fill('25');
  await dialog.getByRole('button', { name: /^(Save|保存)$/ }).click();
  await expect(dialog).toBeHidden();

  await expect(row.locator('td').nth(1)).toHaveText('25');
  await expect(row.locator('td').nth(3)).toContainText('25');

  // Cleanup: it now has stock-movement history, so hard delete is blocked —
  // archive it instead (same as any SKU with history).
  await row.getByRole('button', { name: /^(Archive|归档)$/ }).click();
  await expect(page.getByRole('row', { name: new RegExp(marker) })).toHaveCount(0);
});
