import { test, expect } from '@playwright/test';

test('Team Tasks shows a task from any business date by default', async ({ page }) => {
  const title = `All dates task ${Date.now()}`;
  const taskDate = '2020-01-02';

  await page.goto('/tasks');
  await page.getByRole('button', { name: /New task|新建任务/ }).click();
  await page.locator('#tf-employee').selectOption({ index: 1 });
  await page.locator('#tf-date').fill(taskDate);
  await page.locator('#tf-dept').selectOption({ index: 1 });
  await page.locator('#tf-title').fill(title);
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /^(Save|保存)$/ })
    .click();

  const row = page.getByRole('row', { name: new RegExp(title) });
  await expect(row).toBeVisible();
  await expect(row.getByText('02/01/2020', { exact: true })).toBeVisible();

  await page.locator('#tasks-date').fill(taskDate);
  await page.waitForURL(/\/tasks\?date=2020-01-02/);
  await expect(row).toBeVisible();

  await page.getByRole('button', { name: /All dates|所有日期/ }).click();
  await expect(page).toHaveURL(/\/tasks$/);
  await expect(row).toBeVisible();
});
