import { test, expect } from '@playwright/test';

/**
 * Settings → Telegram editable report times (authenticated Owner):
 *  - a normal time change saves immediately with no warning;
 *  - a time earlier than the manual-entry threshold does NOT block saving but
 *    requires confirmation ("Save anyway").
 *
 * The scheduling/timezone/idempotency logic itself is proven deterministically
 * in tests/unit/report-schedule.test.ts.
 */

test('changing a report time to a normal value saves without a warning', async ({ page }) => {
  await page.goto('/settings/telegram');
  // A prior test run may have left morningTime early (see below) — set it back
  // to a normal value first so this test's expectation (no warning) isn't at
  // the mercy of leftover state from the other spec in this file.
  await page.fill('#morningTime', '08:00');
  await page.fill('#afternoonTime', '14:00');
  await page.getByRole('button', { name: /Save settings|保存设置/ }).click();
  await expect(page.getByText(/Telegram settings saved|已保存 Telegram 设置/)).toBeVisible();
});

test('an early attendance time warns and requires confirmation, but still saves', async ({
  page,
}) => {
  await page.goto('/settings/telegram');

  // 07:00 is before the 07:30 morning manual-entry time.
  await page.fill('#morningTime', '07:00');
  await expect(page.getByText(/Earlier than the usual 07:30|早于通常的 07:30/)).toBeVisible();

  await page.getByRole('button', { name: /Save settings|保存设置/ }).click();

  // Confirmation dialog appears instead of an immediate save.
  const dialog = page.getByRole('dialog');
  await expect(
    dialog.getByText(/Send before manual-entry time\?|在打卡时间前发送？/),
  ).toBeVisible();

  await dialog.getByRole('button', { name: /Save anyway|仍然保存/ }).click();
  await expect(page.getByText(/Telegram settings saved|已保存 Telegram 设置/)).toBeVisible();
});
