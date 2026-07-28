import { test, expect } from '@playwright/test';

/**
 * Settings → Products & Specs product-family management (authenticated Owner):
 *  - add a family (only the Chinese name is required);
 *  - permanently delete a brand-new empty family (safe delete);
 *  - deleting a seeded family that HAS stock history is blocked, and the dialog
 *    offers "Archive instead";
 *  - archive then reactivate a family (archived leaves the Active view).
 *
 * The delete decision logic is proven deterministically in
 * tests/unit/product-families.test.ts (canDeleteFamily / familyDeleteBlockers).
 */

async function addFamily(page: import('@playwright/test').Page, zh: string) {
  await page.goto('/settings/products');
  await page.getByRole('button', { name: /Add Product Family|新增产品系列/ }).click();
  await page.fill('#fam-name', zh);
  await page.getByRole('button', { name: /^(Save|保存)$/ }).click();
  await expect(page.getByText(zh).first()).toBeVisible();
}

test('add a product family, then permanently delete it (no history)', async ({ page }) => {
  const zh = `临时系列 ${Date.now()}`;
  await addFamily(page, zh);

  const row = page.getByRole('row', { name: new RegExp(zh) });
  await row.getByRole('button', { name: /Delete|删除/ }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /^(Delete|删除)$/ })
    .click();

  // Gone from the list — nothing referenced it, so a hard delete is allowed.
  await expect(page.getByText(zh)).toHaveCount(0);
});

test('deleting a family with stock history is blocked and offers Archive', async ({ page }) => {
  await page.goto('/settings/products');

  // 钢筋网 is seeded WITH opening stock -> it has history and cannot be deleted.
  const row = page.getByRole('row', { name: /钢筋网/ });
  await row.getByRole('button', { name: /Delete|删除/ }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /^(Delete|删除)$/ })
    .click();

  await expect(page.getByText(/Archive it instead|请改为归档/)).toBeVisible();
  await expect(
    page.getByRole('dialog').getByRole('button', { name: /Archive family|归档系列/ }),
  ).toBeVisible();
});

test('archive then reactivate a product family', async ({ page }) => {
  const zh = `归档系列 ${Date.now()}`;
  await addFamily(page, zh);

  // Archive (confirmation dialog).
  let row = page.getByRole('row', { name: new RegExp(zh) });
  await row.getByRole('button', { name: /Archive|归档/ }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /Archive family|归档系列/ })
    .click();

  // Archived families leave the default Active view.
  await expect(page.getByText(zh)).toHaveCount(0);

  // Reveal archived, then reactivate.
  await page.getByRole('button', { name: /^(Archived|已归档)$/ }).click();
  row = page.getByRole('row', { name: new RegExp(zh) });
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: /Reactivate|重新启用/ }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /Reactivate family|重新启用系列/ })
    .click();

  // Back under the Active view.
  await page.getByRole('button', { name: /^(Active|启用)$/ }).click();
  await expect(page.getByText(zh).first()).toBeVisible();
});
