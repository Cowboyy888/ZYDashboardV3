import { test, expect } from '@playwright/test';

/**
 * Purchasing critical flow: purchase orders carry line items (SKU, location,
 * qty, unit cost) — required at creation, freely editable while Draft.
 * Create one with a line item, edit the header while Draft, issue it (and
 * confirm editing is no longer offered once issued), then confirm a
 * separate draft can still be cancelled.
 */
test('purchasing: create, edit, and issue a purchase order, cancel a separate draft', async ({
  page,
}) => {
  await page.goto('/purchasing/orders/new');

  // Header — first seeded supplier, today's order date is already defaulted.
  await page.locator('#supplierId').selectOption({ index: 1 });

  // One line item — first real SKU/location option (index 0 is the disabled
  // "Select…" placeholder), required at creation now that items are back.
  await page.getByTestId('po-item-sku').selectOption({ index: 1 });
  await page.getByTestId('po-item-location').selectOption({ index: 1 });
  await page.getByTestId('po-item-qty').fill('50');
  await page.getByTestId('po-item-cost').fill('3.5');

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
  await page.getByTestId('po-item-sku').selectOption({ index: 1 });
  await page.getByTestId('po-item-location').selectOption({ index: 1 });
  await page.getByTestId('po-item-qty').fill('10');
  await page.getByTestId('po-item-cost').fill('1');
  await page.getByRole('button', { name: /Create draft|创建草稿/ }).click();
  await page.waitForURL(/\/purchasing\/orders\/[0-9a-f-]+$/, { timeout: 15_000 });

  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: /^Cancel PO$|取消订单/ }).click();
  await expect(page.getByText(/^Cancelled$|^已取消$/).first()).toBeVisible();
});

test('purchasing: add/remove line items on a Draft PO, filter the list, and export', async ({
  page,
}) => {
  await page.goto('/purchasing/orders/new');
  await page.locator('#supplierId').selectOption({ index: 1 });
  await page.getByTestId('po-item-sku').selectOption({ index: 1 });
  await page.getByTestId('po-item-location').selectOption({ index: 1 });
  await page.getByTestId('po-item-qty').fill('20');
  await page.getByTestId('po-item-cost').fill('2');
  await page.getByRole('button', { name: /Create draft|创建草稿/ }).click();
  await page.waitForURL(/\/purchasing\/orders\/[0-9a-f-]+$/, { timeout: 15_000 });

  // Add a second item via the detail page's "Add line" dialog.
  await page.getByRole('button', { name: /Add line|新增一行/ }).click();
  const dialog = page.getByRole('dialog');
  await dialog.locator('#api-sku').selectOption({ index: 1 });
  await dialog.locator('#api-location').selectOption({ index: 1 });
  await dialog.locator('#api-qty').fill('5');
  await dialog.locator('#api-cost').fill('4');
  await dialog.getByRole('button', { name: /Add line|新增一行/ }).click();
  await expect(dialog).toBeHidden();

  // Grand total reflects both lines: 20*2 + 5*4 = 60.
  await expect(page.getByText(/USD\s*60\.00/)).toBeVisible();

  // Remove the second item — grand total drops back to the first line only (40).
  page.once('dialog', (d) => d.accept());
  await page
    .getByRole('button', { name: /^Delete$|^删除$/ })
    .last()
    .click();
  await expect(page.getByText(/USD\s*40\.00/)).toBeVisible();

  // List page — apply a Status filter and confirm the Excel link carries it.
  await page.goto('/purchasing/orders');
  const statusSelect = page.getByLabel(/^Status$|^状态$/);
  await statusSelect.selectOption('draft');
  await page.getByRole('button', { name: /^Apply$|应用筛选/ }).click();
  await page.waitForURL(/status=draft/);
  const excelLink = page.getByRole('link', { name: /Download Excel|下载 Excel/ });
  await expect(excelLink).toHaveAttribute('href', /status=draft/);

  // PDF export opens a new tab — a direct click gesture (mobile-popup-safe pattern,
  // see this session's Deposit Invoice/Inquiries print fixes). The popup is filled
  // via document.write rather than a navigation, so its URL stays about:blank —
  // assert on the written document's title instead.
  const [popup] = await Promise.all([
    page.waitForEvent('popup'),
    page.getByRole('button', { name: /Download PDF|下载 PDF/ }).click(),
  ]);
  await popup.waitForLoadState();
  await expect(popup).toHaveTitle(/Purchase Orders Report/);
});
