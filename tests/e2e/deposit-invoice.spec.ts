import { test, expect } from '@playwright/test';

/**
 * Deposit Invoice + Payment Receipt critical flow: create a confirmed SO
 * whose one line item uses the optional per-m² pricing breakdown (Price/m² ×
 * Area/sheet → Price/sheet, computed client-side and re-derived
 * server-side), generate a 30% deposit invoice off it, record two deposit
 * payments (Pending Deposit → Partially Paid → Paid), then record two final
 * payments against the remaining balance — one SO number, multiple payment
 * receipts, each individually numbered and tagged Deposit or Final.
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

  // The order's permanent Order Number, independent of any payment.
  await expect(page.getByText(/ZYS-\d{4}Y-\d{3}/).first()).toBeVisible();

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

  // Payment history so far: two Deposit-tagged receipts (100 + 62), each
  // with its own Receipt No. — one SO, multiple receipts.
  await expect(page.getByText(/^Deposit Receipt$|^定金收据$/)).toHaveCount(2);

  // Deposit invoice reached Paid — Record final payment becomes available,
  // with the remaining balance (540 − 162 = 378.00) pre-filled. (Two
  // elements show 378.00 at this exact moment: the deposit invoice's fixed
  // remaining_balance field set at generation time, and the live balance
  // due — they coincide only because no final payment has landed yet.)
  await expect(page.getByText(/378\.00/).first()).toBeVisible();
  await page.getByRole('button', { name: /Record final payment|记录尾款/ }).click();
  const finalDialog1 = page.getByRole('dialog');
  await expect(finalDialog1.locator('input[name="amount"]')).toHaveValue('378.00');

  // Partial final payment — less than the full 378.00 balance.
  await finalDialog1.locator('input[name="amount"]').fill('200');
  await finalDialog1.locator('input[name="paidDate"]').fill('2026-08-10');
  await finalDialog1.getByRole('button', { name: /Record final payment|记录尾款/ }).click();
  await expect(finalDialog1).toBeHidden();

  // Balance drops to 178.00; still collectible, so the button remains.
  await expect(page.getByText(/178\.00/)).toBeVisible();
  await expect(page.getByText(/^Final Payment Receipt$|^尾款收据$/)).toHaveCount(1);
  await expect(page.getByRole('button', { name: /Record final payment|记录尾款/ })).toHaveCount(1);

  // Settle the remaining balance in full.
  await page.getByRole('button', { name: /Record final payment|记录尾款/ }).click();
  const finalDialog2 = page.getByRole('dialog');
  await expect(finalDialog2.locator('input[name="amount"]')).toHaveValue('178.00');
  await finalDialog2.locator('input[name="paidDate"]').fill('2026-08-10');
  await finalDialog2.getByRole('button', { name: /Record final payment|记录尾款/ }).click();
  await expect(finalDialog2).toBeHidden();

  // Fully settled: balance is 0, no further final payment can be recorded,
  // and the payment history shows all four receipts (2 deposit + 2 final)
  // still linked to this single sales order.
  await expect(page.getByText(/USD 0\.00/).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /Record final payment|记录尾款/ })).toHaveCount(0);
  await expect(page.getByText(/^Deposit Receipt$|^定金收据$/)).toHaveCount(2);
  await expect(page.getByText(/^Final Payment Receipt$|^尾款收据$/)).toHaveCount(2);

  // Each of the four payments got its own independent Receipt Number
  // (format ZYS-R-######, globally sequential, unrelated to the Order
  // Number) — all four still linked to the one order number above.
  await expect(page.getByText(/^ZYS-R-\d{6}$/)).toHaveCount(4);
});
