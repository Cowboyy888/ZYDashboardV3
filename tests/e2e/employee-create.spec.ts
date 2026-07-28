import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

/**
 * Employee creation (authenticated as the E2E Owner):
 *  - creating with only Display name + Attendance group + Job title succeeds
 *    (no more "Validation failed", no manual Employee ID);
 *  - the DB assigns a ZY-#### code, and the next employee gets the next number
 *    (atomic sequence, never reused).
 *
 * The exact ZY-0001 / ZY-0002 mapping for sequence 1 / 2 is proven
 * deterministically in tests/unit/employees.test.ts (formatEmployeeCode).
 *
 * This test creates real employees against the shared local DB. `attendance`
 * rows are append-only (hard delete is blocked by a DB trigger), so cleanup
 * archives them instead of deleting — that's enough to keep them off the
 * Attendance page and out of everyone's way.
 */
const createdNames: string[] = [];

test.afterAll(async () => {
  if (createdNames.length === 0) return;
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  await admin.from('employees').update({ is_active: false }).in('display_name', createdNames);
});

async function codeForRow(page: import('@playwright/test').Page, name: string): Promise<number> {
  const row = page.getByRole('row', { name: new RegExp(name) });
  await expect(row).toBeVisible();
  const idText = (await row.locator('td').first().textContent()) ?? '';
  const m = idText.match(/ZY-(\d+)/);
  expect(m, `row "${name}" should show a ZY-#### id, got "${idText}"`).not.toBeNull();
  return Number(m![1]);
}

test('employee create assigns sequential ZY-#### ids with only 3 required fields', async ({
  page,
}) => {
  const stamp = Date.now();
  const n1 = `E2E One ${stamp}`;
  const n2 = `E2E Two ${stamp}`;
  createdNames.push(n1, n2);

  await page.goto('/employees');
  await page.getByRole('button', { name: /Add employee|新增员工/ }).click();

  // Create #1 — only the three required fields.
  await page.fill('#ce-display', n1);
  await page.locator('#ce-group').selectOption({ index: 1 });
  await page.fill('#ce-title', 'Operator');
  await page.getByRole('button', { name: /Create employee|创建员工/ }).click();
  await expect(page.getByText(/Employee ZY-\d+ created/)).toBeVisible();

  // Create #2 — the form auto-clears after success.
  await page.fill('#ce-display', n2);
  await page.locator('#ce-group').selectOption({ index: 1 });
  await page.fill('#ce-title', 'Operator');
  await page.getByRole('button', { name: /Create employee|创建员工/ }).click();
  await expect(page.getByText(/Employee ZY-\d+ created/)).toBeVisible();

  const first = await codeForRow(page, n1);
  const second = await codeForRow(page, n2);

  expect(first).toBeGreaterThan(0);
  expect(second).toBe(first + 1); // atomic, sequential, never reused
});

test('employee create shows a field error (not "Validation failed") when required fields are blank', async ({
  page,
}) => {
  await page.goto('/employees');
  await page.getByRole('button', { name: /Add employee|新增员工/ }).click();
  await page.getByRole('button', { name: /Create employee|创建员工/ }).click();
  // Field-level messages, not a single generic error.
  await expect(page.getByText(/English name is required|英文姓名为必填/)).toBeVisible();
  await expect(page.getByText(/Job title is required|职位为必填/)).toBeVisible();
});
