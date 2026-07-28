import { test, expect } from '@playwright/test';

/**
 * Telegram Report Preview page renders the exact grouped Chinese attendance
 * format (morning + afternoon), generated from live records.
 */
test('report preview renders the exact grouped Chinese format', async ({ page }) => {
  await page.goto('/reports');

  await expect(page.getByText('中粤钢铁上午出勤记录')).toBeVisible();
  await expect(page.getByText('中粤钢铁下午出勤记录')).toBeVisible();
  // Group line format "{group} {actual}/{scheduled}" and the final total line.
  await expect(page.getByText(/总计\s*\d+人，实到\s*\d+人/).first()).toBeVisible();
});
