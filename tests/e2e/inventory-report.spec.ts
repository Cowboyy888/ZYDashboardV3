import { test, expect } from '@playwright/test';

/**
 * Inventory → Report tab: Standard vs Special specification split, computed
 * automatically from `size` (never a manually entered category) — see
 * `classifySpecification` in src/lib/domain/products.ts.
 */

test('Report tab splits stock into Standard / Special sections and filters work', async ({
  page,
}) => {
  await page.goto('/inventory');
  await page.getByRole('tab', { name: /^(Report|报表)$/ }).click();

  // Section captions are unique to the report cards (unlike the section
  // titles, which are also repeated as options in the filter dropdown below).
  await expect(page.getByText(/3 × 6 m \| 2\.4 × 6 m|3 × 6 米 \| 2\.4 × 6 米/)).toBeVisible();
  await expect(page.getByText(/All other sizes|其他所有尺寸/)).toBeVisible();

  // Seed data has both a 3×6 mesh SKU (Standard) and a coil/wire SKU with no
  // size (Special) — both sections should have at least one real data row,
  // not just the "no records" placeholder.
  const standardTable = page
    .locator('table')
    .filter({ has: page.getByText(/Diameter|直径/) })
    .first();
  await expect(standardTable.locator('tbody tr').first()).toBeVisible();

  // Specification Type filter: switching to "Special" only empties the
  // Standard section (every Standard row is filtered out) while Special
  // keeps its rows.
  await page.getByLabel(/Specification Type|规格类型/).selectOption('special');
  await expect(
    page.getByText(/No specifications match these filters|没有符合筛选条件的规格/),
  ).toBeVisible();
});

test('Report tab exposes PDF and Excel export links', async ({ page }) => {
  await page.goto('/inventory');
  await page.getByRole('tab', { name: /^(Report|报表)$/ }).click();

  const pdfLink = page.getByRole('link', { name: /Download PDF|下载 PDF/ });
  const excelLink = page.getByRole('link', { name: /Download Excel|下载 Excel/ });
  await expect(pdfLink).toHaveAttribute('href', '/api/export/inventory/pdf');
  await expect(excelLink).toHaveAttribute('href', '/api/export/inventory');
});
