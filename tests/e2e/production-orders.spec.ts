import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

test('P4.1 source plan saves, edits, approves and cancels without posting stock', async ({
  page,
}) => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  test.skip(
    !url || !['127.0.0.1', 'localhost'].includes(new URL(url).hostname),
    'Requires disposable local Supabase.',
  );
  const admin = createClient(url!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: sku } = await admin
    .from('skus')
    .select('id')
    .eq('is_active', true)
    .eq('unit', '张')
    .limit(1)
    .single();
  const { data: location } = await admin
    .from('locations')
    .select('id')
    .eq('is_active', true)
    .limit(1)
    .single();
  expect(sku).toBeTruthy();
  expect(location).toBeTruthy();
  const { data: customer, error: customerError } = await admin
    .from('customers')
    .insert({ name: `P4 e2e ${Date.now()}` })
    .select('id')
    .single();
  expect(customerError).toBeNull();
  const { data: so, error: soError } = await admin
    .from('sales_orders')
    .insert({ customer_id: customer!.id, currency: 'USD' })
    .select('id')
    .single();
  expect(soError).toBeNull();
  const { data: item, error: itemError } = await admin
    .from('sales_order_items')
    .insert({
      sales_order_id: so!.id,
      sku_id: sku!.id,
      location_id: location!.id,
      unit: '张',
      ordered_qty: 100,
      unit_price: 1,
    })
    .select('id')
    .single();
  expect(itemError).toBeNull();
  expect(
    (await admin.from('sales_orders').update({ status: 'confirmed' }).eq('id', so!.id)).error,
  ).toBeNull();
  const { data: drawing, error: drawingError } = await admin
    .from('wire_mesh_drawings')
    .insert({
      sales_order_id: so!.id,
      customer_name: 'P4 e2e',
      mesh_specification: `P4 e2e drawing ${Date.now()}`,
      wire_diameter_mm: 5.5,
      sheet_length_mm: 6000,
      sheet_width_mm: 2400,
      length_spacing_mm: 200,
      width_spacing_mm: 200,
      quantity: 10,
    })
    .select('id')
    .single();
  expect(drawingError).toBeNull();
  const before = await admin.from('stock_movements').select('id', { count: 'exact', head: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/production/new');
  await page.locator('#prod-salesOrderItemId').selectOption(item!.id);
  await page.locator('#prod-drawingId').selectOption(drawing!.id);
  await page.locator('#prod-quantity').fill('10');
  await page.getByRole('button', { name: /^(Save|保存)$/ }).click();
  await page.waitForURL(/\/production\/[0-9a-f-]{36}$/);
  const productionId = page.url().split('/').pop()!;
  await expect(page.getByRole('heading', { name: /PRD-\d{4}-\d{8,}/ })).toBeVisible();
  await expect(page.locator('body')).toContainText('144 m²');
  await page.getByRole('link', { name: /Edit draft|编辑草稿/ }).click();
  await page.locator('#prod-quantity').fill('12');
  await page.getByRole('button', { name: /^(Save|保存)$/ }).click();
  await page.waitForURL(new RegExp(`/production/${productionId}$`));
  await page
    .getByRole('button', { name: /Approve \/ resume approved plan|审批 \/ 恢复已审批计划/ })
    .click();
  await expect(page.getByRole('link', { name: /Edit draft|编辑草稿/ })).toHaveCount(0);
  await page.locator('#reason-cancelled').fill('E2E plan withdrawn');
  await page.getByRole('button', { name: /Cancel production order|取消生产订单/ }).click();
  await expect(page.locator('body')).toContainText(/Cancelled|已取消/);
  const { data: plan } = await admin
    .from('production_orders')
    .select('status,planned_quantity,approved_at')
    .eq('id', productionId)
    .single();
  expect(plan).toMatchObject({ status: 'cancelled', planned_quantity: 12 });
  expect(plan!.approved_at).toBeTruthy();
  const after = await admin.from('stock_movements').select('id', { count: 'exact', head: true });
  expect(after.count).toBe(before.count);
});
