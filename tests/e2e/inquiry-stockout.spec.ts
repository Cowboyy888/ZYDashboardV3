import { test, expect } from '@playwright/test';

test('unavailable product evidence survives edits on the same inquiry', async ({ page }) => {
  const customer = `Stockout inquiry ${Date.now()}`;
  await page.goto('/sales/inquiries');
  await page.getByRole('button', { name: /New inquiry|新增询价/ }).click();
  const dialog = page.getByRole('dialog');
  await dialog.locator('#if-customerName').fill(customer);
  const unavailableOption = dialog
    .locator('#if-lossReason option')
    .filter({ hasText: /Product unavailable|产品缺货/ });
  const reasonValue = await unavailableOption.getAttribute('value');
  expect(reasonValue).toBeTruthy();
  await dialog.locator('#if-lossReason').selectOption(reasonValue!);
  await dialog.getByRole('button', { name: /^(Save|保存)$/ }).click();
  await expect(
    dialog.getByText(/Wire diameter is required|缺货需求必须填写钢丝直径/),
  ).toBeVisible();

  await dialog.locator('#if-diameter').fill('5.5');
  await dialog.locator('#if-sheetSize').fill('2.4×6');
  await dialog.locator('#if-meshOpening').fill('200×200');
  await dialog.locator('#if-qty').fill('100');
  await dialog.getByRole('button', { name: /^(Save|保存)$/ }).click();
  await expect(dialog).not.toBeVisible();

  const row = page.getByRole('row').filter({ hasText: customer });
  await expect(row).toHaveCount(1);
  await expect(row.getByText(/Product unavailable|产品缺货/)).toBeVisible();
  await row.getByRole('button', { name: /Edit inquiry|编辑询价/ }).click();
  await expect(dialog.locator('#if-diameter')).toHaveValue('5.5');
  await expect(dialog.locator('#if-sheetSize')).toHaveValue('2.4×6');
  await expect(dialog.locator('#if-meshOpening')).toHaveValue('200×200');
  await expect(dialog.locator('#if-lossReason option:checked')).toHaveText(
    /Product unavailable|产品缺货/,
  );
  await dialog.locator('#if-qty').fill('120');
  await dialog.getByRole('button', { name: /^(Save|保存)$/ }).click();
  await expect(dialog).not.toBeVisible();
  await page.reload();
  await expect(row).toHaveCount(1);
  await expect(row.getByRole('cell', { name: '120', exact: true })).toBeVisible();
  await expect(row.getByText(/Product unavailable|产品缺货/)).toBeVisible();
});
