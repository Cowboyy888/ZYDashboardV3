import { test, expect } from '@playwright/test';

/**
 * Deposit Invoice critical flow: create a confirmed SO whose one line item
 * uses the optional per-m² pricing breakdown (Price/m² × Area/sheet →
 * Price/sheet, computed client-side and re-derived server-side), generate a
 * 30% deposit invoice off it, then record two payments and verify the
 * invoice's status moves Pending Deposit → Partially Paid → Paid.
 */
test('deposit invoice: generate off a confirmed SO, then record payments to Paid', async ({
  page,
}) => {
  await page.goto('/sales/orders/new');

  await page.locator('#customerId').selectOption({ index: 1 });
  await page.locator('#expectedDeliveryDate').fill('2026-08-20');

  await page.getByTestId('so-item-sku').selectOption({ index: 1 });
  await page.getByTestId('so-item-location').selectOption({ index: 1 });
  await page.getByTestId('so-item-qty').fill('100');
  await page.getByTestId('so-item-area').fill('3');
  await page.getByTestId('so-item-price-sqm').fill('1.8');

  // Unit price is derived (1.8 × 3 = 5.4) and read-only once both are set.
  const priceInput = page.getByTestId('so-item-price');
  await expect(priceInput).toHaveValue('5.4');
  await expect(priceInput).toHaveAttribute('readonly', '');

  await page.getByRole('button', { name: /Create draft|创建草稿/ }).click();
  await page.waitForURL(/\/sales\/orders\/[0-9a-f-]+$/, { timeout: 15_000 });
  await expect(page.getByText(/^Draft$|^草稿$/).first()).toBeVisible();

  // Confirm — required before a deposit invoice may be generated.
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: /^Confirm$|确认订单/ }).click();
  await expect(page.getByText(/^Confirmed$|^已确认$/).first()).toBeVisible();

  // Generate a 30% deposit invoice. Total order amount = 5.4 × 100 = 540,
  // so deposit = 162.00, remaining balance = 378.00.
  await page.getByRole('button', { name: /Generate Deposit Invoice|生成定金发票/ }).click();
  const genDialog = page.getByRole('dialog');
  await genDialog.getByRole('button', { name: '30%' }).click();
  await genDialog.getByRole('button', { name: /Generate Deposit Invoice|生成定金发票/ }).click();
  await expect(genDialog).toBeHidden();

  await expect(page.getByText(/^Pending Deposit$|^待付定金$/).first()).toBeVisible();
  await expect(page.getByText(/162\.00/)).toBeVisible();
  await expect(page.getByText(/378\.00/)).toBeVisible();
  // No second invoice can be generated while this one is active.
  await expect(
    page.getByRole('button', { name: /Generate Deposit Invoice|生成定金发票/ }),
  ).toHaveCount(0);

  // Partial payment — less than the 162.00 deposit.
  await page.getByRole('button', { name: /Record payment|记录付款/ }).click();
  const payDialog1 = page.getByRole('dialog');
  await payDialog1.locator('input[name="amount"]').fill('100');
  await payDialog1.locator('input[name="paidDate"]').fill('2026-08-03');
  await payDialog1.getByRole('button', { name: /Record payment|记录付款/ }).click();
  await expect(payDialog1).toBeHidden();
  await expect(page.getByText(/^Partially Paid$|^部分付款$/).first()).toBeVisible();

  // Remaining payment to fully cover the deposit.
  await page.getByRole('button', { name: /Record payment|记录付款/ }).click();
  const payDialog2 = page.getByRole('dialog');
  await payDialog2.locator('input[name="amount"]').fill('62');
  await payDialog2.locator('input[name="paidDate"]').fill('2026-08-03');
  await payDialog2.getByRole('button', { name: /Record payment|记录付款/ }).click();
  await expect(payDialog2).toBeHidden();
  await expect(page.getByText(/^Paid$|^已付款$/).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /Record payment|记录付款/ })).toHaveCount(0);
});
