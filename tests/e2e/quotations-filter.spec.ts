import { test, expect, type Page } from '@playwright/test';

async function createUnlinkedQuotation(page: Page, customerName: string, quotationDate?: string) {
  await page.getByRole('button', { name: /New quotation|新增报价单/ }).click();
  await page.locator('#q-customer').fill(customerName);
  if (quotationDate) await page.locator('#q-date').fill(quotationDate);
  await page.locator('input[name="itemDescription"]').fill('Filter regression test item');
  await page.locator('input[name="itemUnitPrice"]').fill('10');
  await page.locator('input[name="itemQuantity"]').fill('1');
  await page.getByRole('button', { name: /^(Save|保存)$/ }).click();
  await expect(page.getByRole('row', { name: new RegExp(customerName) })).toBeVisible();
}

test('quotation customer filter includes unlinked quotations and clear filters restores the list', async ({
  page,
}) => {
  const stamp = Date.now();
  const firstCustomer = `Quotation Filter A ${stamp}`;
  const secondCustomer = `Quotation Filter B ${stamp}`;

  await page.goto('/sales/quotations');
  await createUnlinkedQuotation(page, firstCustomer);
  await createUnlinkedQuotation(page, secondCustomer);

  // Customer linking is optional on a quotation. The filter must use the
  // required, displayed customer name so both newly-created unlinked rows are
  // available to it.
  await page.locator('#quo-filter-customer').selectOption({ label: firstCustomer });
  await expect(page).toHaveURL(/customerName=Quotation(?:%20|\+)Filter(?:%20|\+)A/);
  await expect(page.getByRole('row', { name: new RegExp(firstCustomer) })).toBeVisible();
  await expect(page.getByRole('row', { name: new RegExp(secondCustomer) })).toHaveCount(0);

  // A text search can be combined with the dropdown filter, then clear-all
  // removes every list-filter parameter and restores both rows.
  await page
    .getByPlaceholder(/Search quotation no\. or customer|搜索报价单号或客户/)
    .fill(firstCustomer);
  await page.waitForURL(/q=Quotation(?:%20|\+)Filter(?:%20|\+)A/, { timeout: 5_000 });
  await page.getByRole('button', { name: /Clear filters|清除筛选/ }).click();
  await expect(page).toHaveURL(/\/sales\/quotations$/);
  await expect(page.getByRole('row', { name: new RegExp(firstCustomer) })).toBeVisible();
  await expect(page.getByRole('row', { name: new RegExp(secondCustomer) })).toBeVisible();
});

test('quotation date range filters the list and clear filters restores it', async ({ page }) => {
  const stamp = Date.now();
  const firstCustomer = `Quotation Date A ${stamp}`;
  const secondCustomer = `Quotation Date B ${stamp}`;
  const firstDate = '2026-01-10';
  const secondDate = '2026-01-11';

  await page.goto('/sales/quotations');
  await createUnlinkedQuotation(page, firstCustomer, firstDate);
  await createUnlinkedQuotation(page, secondCustomer, secondDate);

  await page.locator('#quo-filter-date-from').fill(firstDate);
  await page.waitForURL(/dateFrom=2026-01-10/);
  await page.locator('#quo-filter-date-to').fill(firstDate);
  await page.waitForURL(/dateTo=2026-01-10/);
  await expect(page.getByRole('row', { name: new RegExp(firstCustomer) })).toBeVisible();
  await expect(page.getByRole('row', { name: new RegExp(secondCustomer) })).toHaveCount(0);

  await page.getByRole('button', { name: /Clear filters|清除筛选/ }).click();
  await expect(page).toHaveURL(/\/sales\/quotations$/);
  await expect(page.getByRole('row', { name: new RegExp(firstCustomer) })).toBeVisible();
  await expect(page.getByRole('row', { name: new RegExp(secondCustomer) })).toBeVisible();
});
