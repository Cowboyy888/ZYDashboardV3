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
