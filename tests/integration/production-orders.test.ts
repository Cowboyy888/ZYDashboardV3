import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { assertPermission, type CurrentUser } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { hasPermission, type Role } from '@/lib/domain/rbac';
import {
  saveProductionOrder,
  transitionProductionOrder,
  searchProductionReferences,
} from '@/lib/actions/production-orders';
import { getProductionOrders } from '@/lib/db/production-queries';

vi.mock('@/lib/auth', () => ({ assertPermission: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
const id = '11111111-1111-4111-8111-111111111111';
let role: Role;
let errorCode: string | null;
let requests: { url: URL; method: string; body: Record<string, unknown> | null }[];
function form(overrides: Record<string, string> = {}) {
  const form = new FormData();
  for (const [key, value] of Object.entries({
    id,
    version: '0',
    businessDate: '2026-10-30',
    skuId: id,
    drawingId: id,
    plannedQuantity: '10',
    requiredDate: '2026-11-04',
    priority: 'normal',
    internalReason: 'Low finished stock',
    ...overrides,
  }))
    form.set(key, value);
  return form;
}
beforeEach(() => {
  vi.clearAllMocks();
  role = 'warehouse_admin';
  errorCode = null;
  requests = [];
  vi.mocked(assertPermission).mockImplementation(async (permission) => {
    if (!hasPermission(role, permission)) throw new Error('Forbidden');
    return { id, role } as CurrentUser;
  });
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    requests.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : null });
    if (errorCode)
      return new Response(JSON.stringify({ code: errorCode, message: errorCode }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      });
    const body = url.pathname.endsWith('/create_production_order')
      ? id
      : url.pathname.endsWith('/production_reference_options')
        ? []
        : method === 'GET'
          ? []
          : { id };
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json', 'content-range': '*/0' },
    });
  };
  vi.mocked(createSupabaseServerClient).mockResolvedValue(
    createClient('https://production-test.invalid', 'test-key', {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: fetcher },
    }),
  );
});

describe('P4.1 actions and bounded reads — actual Supabase query builder', () => {
  it('sends a stable request ID to the idempotent create RPC, never a stock mutation', async () => {
    expect((await saveProductionOrder(null, form()))?.ok).toBe(true);
    expect(requests).toHaveLength(1);
    expect(requests[0]!.url.pathname).toBe('/rest/v1/rpc/create_production_order');
    expect(requests[0]!.body).toMatchObject({
      p_id: id,
      p_input: {
        internal_reason: 'Low finished stock',
        sales_order_item_id: null,
        planned_quantity: 10,
      },
    });
  });
  it('uses version compare-and-swap for edits and reports stale writes', async () => {
    expect((await saveProductionOrder(null, form({ version: '3' })))?.ok).toBe(true);
    expect(requests[0]!.url.searchParams.get('version')).toBe('eq.3');
    expect(requests[0]!.method).toBe('PATCH');
    errorCode = 'PGRST116';
    expect((await saveProductionOrder(null, form({ version: '3' })))?.error).toContain('Reload');
  });
  it('maps database duplicate-plan and owner-approval errors to actionable messages', async () => {
    errorCode = '23505';
    expect((await saveProductionOrder(null, form()))?.error).toContain('already exists');
    role = 'owner';
    errorCode = 'PRODUCTION_APPROVE_OWNER_ONLY';
    expect(
      (await transitionProductionOrder(null, form({ version: '1', status: 'approved' })))?.error,
    ).toContain('Owner');
  });
  it('rejects approval for Warehouse Admin before database access', async () => {
    await expect(
      transitionProductionOrder(null, form({ version: '1', status: 'approved' })),
    ).rejects.toThrow('Forbidden');
    expect(requests).toHaveLength(0);
  });
  it.each(['sales_admin', 'system_admin', 'marketing_admin', 'viewer'] as Role[])(
    'rejects draft management for %s',
    async (deniedRole) => {
      role = deniedRole;
      await expect(saveProductionOrder(null, form())).rejects.toThrow('Forbidden');
      expect(requests).toHaveLength(0);
    },
  );
  it('rejects missing hold/cancel reasons and fractional sheets before a mutation', async () => {
    expect(
      (await transitionProductionOrder(null, form({ version: '1', status: 'on_hold' })))?.ok,
    ).toBe(false);
    expect((await saveProductionOrder(null, form({ plannedQuantity: '1.5' })))?.ok).toBe(false);
    expect(requests).toHaveLength(0);
  });
  it('queries exactly one 20-row page with status on the server', async () => {
    await getProductionOrders(3, 'on_hold');
    expect(requests[0]!.url.searchParams.get('offset')).toBe('40');
    expect(requests[0]!.url.searchParams.get('limit')).toBe('20');
    expect(requests[0]!.url.searchParams.get('status')).toBe('eq.on_hold');
    expect(requests[0]!.url.searchParams.get('select')).not.toContain('creation_payload');
  });
  it('rejects unbounded searches and delegates valid searches to the narrow RPC', async () => {
    expect((await searchProductionReferences('skus', 'x'.repeat(81))).error).toBeTruthy();
    expect(requests).toHaveLength(0);
    await searchProductionReferences('skus', '5.5');
    expect(requests[0]!.body).toMatchObject({ p_kind: 'skus', p_search: '5.5' });
  });
});
