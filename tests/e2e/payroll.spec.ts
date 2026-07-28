import { test, expect } from '@playwright/test';

/**
 * Payroll (Fourth pass) critical flow: generate a draft run, add a deduction
 * line, approve it (Owner-only), then mark it Paid — verifying the run moves
 * Draft → Approved → Paid and that line management disappears once approved
 * (Approved payroll is permanently immutable).
 */
test('payroll: generate a draft run, add a deduction, approve, and mark paid', async ({ page }) => {
  await page.goto('/payroll/new');

  // The form comes pre-filled with a sensible default period — just submit it.
  await page.getByRole('button', { name: /Generate draft|生成草稿/ }).click();

  // Redirected to the new run's detail page, still Draft.
  await page.waitForURL(/\/payroll\/[0-9a-f-]+$/, { timeout: 15_000 });
  await expect(page.getByText(/^Draft$|^草稿$/).first()).toBeVisible();

  // At least one payslip line exists (every active employee gets one).
  const firstRow = page.getByRole('row').nth(1); // row 0 is the header
  await expect(firstRow).toBeVisible();

  // Add a deduction line to the first payslip.
  await page
    .getByRole('button', { name: /Deductions \/ advances|扣除 \/ 预支/ })
    .first()
    .click();
  const linesForm = page.locator('form').filter({ has: page.locator('input[name="label"]') });
  await linesForm.locator('select[name="kind"]').selectOption('deduction');
  await linesForm.locator('input[name="label"]').fill('Uniform deduction');
  await linesForm.locator('input[name="amount"]').fill('5');
  await linesForm.getByRole('button', { name: /^(Add|添加)$/ }).click();

  // The line shows up with its label (never asserting on any dollar amount
  // here beyond what we just entered — this test never inspects real seeded
  // salary figures, only the deduction it added itself).
  await expect(page.getByText('Uniform deduction')).toBeVisible();

  // Approve it (this test runs as the E2E Owner, so this should succeed).
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: /^Approve$|^批准$/ }).click();
  await expect(page.getByText(/^Approved$|^已批准$/).first()).toBeVisible();

  // Once approved, line management disappears — items are permanently locked.
  await expect(
    page.getByRole('button', { name: /Deductions \/ advances|扣除 \/ 预支/ }),
  ).toHaveCount(0);

  // Mark it Paid.
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: /Mark Paid|标记已发放/ }).click();
  await expect(page.getByText(/^Paid$|^已发放$/).first()).toBeVisible();
});
