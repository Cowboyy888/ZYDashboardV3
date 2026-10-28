import { test, expect } from '@playwright/test';

test('a wire mesh drawing pre-fills a reference, accepts review edits, and exposes PDF export', async ({
  page,
}) => {
  const specification = `Mesh drawing ${Date.now()}`;
  const reviewedCustomer = `Reviewed customer ${Date.now()}`;
  await page.goto('/sales/wire-mesh-drawings');
  await page.getByRole('button', { name: /New drawing|新建图纸/ }).click();
  await page.locator('#wm-reference').selectOption({ index: 1 });
  await expect(page.locator('#wm-customer')).not.toHaveValue('');
  await expect(page.getByText(/prefilled|预填/)).toBeVisible();
  await page.locator('#wm-customer').fill(reviewedCustomer);
  await page.locator('#wm-spec').fill(specification);
  await page.locator('#wm-dia').fill('6');
  await page.locator('#wm-length').fill('3000');
  await page.locator('#wm-width').fill('1500');
  await page.locator('#wm-length-spacing').fill('200');
  await page.locator('#wm-width-spacing').fill('200');
  await page.locator('#wm-left').fill('100');
  await page.locator('#wm-right').fill('100');
  await page.locator('#wm-top').fill('50');
  await page.locator('#wm-bottom').fill('50');
  await page.locator('#wm-quantity').fill('3');
  await page.getByRole('button', { name: /^(Save|保存)$/ }).click();
  const row = page.getByRole('row', { name: new RegExp(specification) });
  await expect(row).toBeVisible();
  await expect(row).toContainText(reviewedCustomer);
  const pdfHref = await row.getByRole('link', { name: 'PDF' }).getAttribute('href');
  expect(pdfHref).toBeTruthy();
  const pdf = await page.request.get(pdfHref!);
  expect(pdf.ok()).toBe(true);
  expect(pdf.headers()['content-type']).toContain('application/pdf');

  await row.getByRole('button', { name: /Edit|编辑/ }).click();
  await expect(page.locator('#wm-spec')).toHaveValue(specification);
  await expect(page.locator('#wm-customer')).toHaveValue(reviewedCustomer);
  await expect(
    page.getByRole('dialog').locator('svg[aria-label="Wire mesh drawing"]'),
  ).toBeVisible();
});
