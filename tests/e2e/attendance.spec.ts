import { test, expect } from '@playwright/test';

/**
 * Attendance entry (authenticated as the E2E Owner). Marks the morning shift all
 * present, then sets one employee to Leave and checks the exception shows.
 */
test('attendance: mark all present, then set a leave exception', async ({ page }) => {
  await page.goto('/attendance');
  await expect(page.getByRole('tab', { name: /Morning/ })).toBeVisible();

  await page.getByRole('button', { name: 'Mark all present' }).click();
  // Once everyone is present, the "still unmarked" warning must disappear.
  await expect(page.getByText(/still unmarked for this shift/i)).toHaveCount(0);

  // Set the first employee to Leave.
  await page.getByRole('button', { name: 'Leave', exact: true }).first().click();
  await expect(page.getByText('Leave', { exact: true }).first()).toBeVisible();
});

test('attendance: filters separate Office and Factory downloads by date range', async ({
  page,
}) => {
  await page.goto('/attendance?date=2026-10-30');
  const downloads = page.getByRole('link', { name: /Download report|下载报告/ });
  await expect(downloads).toHaveCount(2);
  await expect(downloads.nth(0)).toHaveAttribute(
    'href',
    '/api/export/attendance?from=2026-10-30&to=2026-10-30&location=office',
  );
  await expect(downloads.nth(1)).toHaveAttribute(
    'href',
    '/api/export/attendance?from=2026-10-30&to=2026-10-30&location=factory',
  );

  await page.getByLabel(/Date from|起始日期/).fill('2026-10-01');
  await page.getByLabel(/Date to|结束日期/).fill('2026-10-31');
  await expect(downloads.nth(0)).toHaveAttribute(
    'href',
    '/api/export/attendance?from=2026-10-01&to=2026-10-31&location=office',
  );
  await expect(downloads.nth(1)).toHaveAttribute(
    'href',
    '/api/export/attendance?from=2026-10-01&to=2026-10-31&location=factory',
  );
});
