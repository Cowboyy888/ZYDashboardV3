import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { assertPermission, type CurrentUser } from '@/lib/auth';
import { hasPermission, type Role } from '@/lib/domain/rbac';
import { writeAudit } from '@/lib/audit';
import { createInquiry, updateInquiry } from '@/lib/actions/sales-inquiries';
import { STOCKOUT_REASON_CODE } from '@/lib/domain/inquiry-loss';

vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: vi.fn() }));
vi.mock('@/lib/auth', () => ({ assertPermission: vi.fn() }));
vi.mock('@/lib/audit', () => ({ writeAudit: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const id = '11111111-1111-4111-8111-111111111111';
const reasonId = '22222222-2222-4222-8222-222222222222';
const customerId = '33333333-3333-4333-8333-333333333333';
let role: Role;
let reason: { id: string; code: string; is_active: boolean } | null;
let row: Record<string, unknown>;
let requests: {
  table: string;
  method: string;
  body: Record<string, unknown> | null;
  prefer: string;
}[];
let denyReasonWrite: boolean;
let failInquiryRead: boolean;

function form(overrides: Record<string, string> = {}) {
  const data = new FormData();
  for (const [key, value] of Object.entries({
    id,
    customerName: 'Existing customer',
    diameter: '5.5',
    sheetSize: '2.4×6',
    meshOpening: '200×200',
    quantity: '100',
    lossReasonId: STOCKOUT_REASON_CODE,
    ...overrides,
  }))
    data.set(key, value);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  role = 'sales_admin';
  reason = null;
  row = { id, customer_id: customerId, loss_reason_id: null, quantity: 100 };
  requests = [];
  denyReasonWrite = false;
  failInquiryRead = false;
  vi.mocked(assertPermission).mockImplementation(async (permission) => {
    if (!hasPermission(role, permission)) throw new Error('Forbidden');
    return { id: 'actor', role } as CurrentUser;
  });
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    const table = url.pathname.split('/').pop()!;
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    requests.push({ table, method, body, prefer: new Headers(init?.headers).get('prefer') ?? '' });
    const json = (value: unknown, status = 200) =>
      new Response(JSON.stringify(value), {
        status,
        headers: { 'content-type': 'application/json' },
      });
    if (table === 'inquiry_loss_reasons') {
      if (method === 'POST') {
        if (denyReasonWrite) return json({ message: 'Reason write denied' }, 403);
        if (reason) return json([]);
        reason = { id: reasonId, code: body.code, is_active: true };
        return json([{ id: reasonId }]);
      }
      const matches =
        reason &&
        (url.searchParams.get('id') === `eq.${reason.id}` ||
          url.searchParams.get('code') === `eq.${reason.code}`);
      return json(matches ? [reason] : []);
    }
    if (table === 'sales_inquiries') {
      if (method === 'GET')
        return failInquiryRead ? json({ message: 'Inquiry read denied' }, 403) : json(row);
      row = { ...row, ...body };
      return json({ id, inquiry_no: 'ZY-2026-001' });
    }
    throw new Error(`Unexpected table: ${table}`);
  };
  vi.mocked(createSupabaseServerClient).mockResolvedValue(
    createClient('https://inquiry-test.invalid', 'test-key', {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: fetcher },
    }),
  );
});

describe('stockout evidence on the existing inquiry — actual Supabase query builder', () => {
  it('creates an explicit reason once and revises the same linked inquiry without touching inventory', async () => {
    expect((await updateInquiry(null, form()))?.ok).toBe(true);
    expect(row.loss_reason_id).toBe(reasonId);
    expect(row.customer_id).toBe(customerId);
    expect((await updateInquiry(null, form({ quantity: '120' })))?.ok).toBe(true);
    expect(row.quantity).toBe(120);
    expect(
      requests.filter((r) => r.table === 'sales_inquiries' && r.method === 'POST'),
    ).toHaveLength(0);
    expect(requests.filter((r) => r.method === 'PATCH')).toHaveLength(2);
    expect(
      requests
        .filter((r) => r.table === 'inquiry_loss_reasons' && r.method === 'POST')
        .every((r) => r.prefer.includes('resolution=ignore-duplicates')),
    ).toBe(true);
    expect(
      vi
        .mocked(writeAudit)
        .mock.calls.filter(([, entry]) => entry.action === 'inquiry_loss_reason.create'),
    ).toHaveLength(1);
    expect(writeAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: 'inquiry.update',
        oldValue: expect.objectContaining({ loss_reason_id: null }),
        newValue: expect.objectContaining({ loss_reason_id: reasonId, quantity: 100 }),
      }),
    );
  });

  it('records the same stockout metadata when creating an inquiry', async () => {
    expect((await createInquiry(null, form({ customerId })))?.ok).toBe(true);
    expect(row).toMatchObject({
      customer_id: customerId,
      loss_reason_id: reasonId,
      diameter: '5.5',
      sheet_size: '2.4×6',
      mesh_opening: '200×200',
      quantity: 100,
    });
    expect(writeAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: 'inquiry.create',
        newValue: expect.objectContaining({
          customer_id: customerId,
          loss_reason_id: reasonId,
          quantity: 100,
        }),
      }),
    );
  });

  it('does not reactivate an archived unavailable-product code on first-use submission', async () => {
    reason = { id: reasonId, code: STOCKOUT_REASON_CODE, is_active: false };
    expect((await createInquiry(null, form()))?.error).toBe('Select an active loss reason.');
    expect(reason.is_active).toBe(false);
    expect(requests.some((r) => r.table === 'sales_inquiries')).toBe(false);
  });

  it('rejects an unknown lookup UUID before writing an inquiry', async () => {
    expect((await createInquiry(null, form({ lossReasonId: reasonId })))?.error).toBe(
      'Select an active loss reason.',
    );
    expect(requests.some((r) => r.table === 'sales_inquiries')).toBe(false);
  });

  it('validates stockout fields before creating the shared reason or updating an inquiry', async () => {
    const result = await createInquiry(null, form({ quantity: '0', diameter: '' }));
    expect(result?.ok).toBe(false);
    expect(result?.fieldErrors).toHaveProperty('quantity');
    expect(result?.fieldErrors).toHaveProperty('diameter');
    expect(requests).toHaveLength(0);
  });

  it('applies stockout validation to a saved reason UUID as well as the first-use code', async () => {
    reason = { id: reasonId, code: STOCKOUT_REASON_CODE, is_active: true };
    const result = await updateInquiry(null, form({ lossReasonId: reasonId, meshOpening: '' }));
    expect(result?.fieldErrors).toHaveProperty('meshOpening');
    expect(requests.some((r) => r.method === 'PATCH')).toBe(false);
  });

  it('preserves omitted reasons/customer links and supports explicitly clearing a reason', async () => {
    reason = { id: reasonId, code: 'L1', is_active: true };
    row.loss_reason_id = reasonId;
    const data = form();
    data.delete('lossReasonId');
    expect((await updateInquiry(null, data))?.ok).toBe(true);
    expect(row.loss_reason_id).toBe(reasonId);
    expect(row.customer_id).toBe(customerId);
    expect((await updateInquiry(null, form({ lossReasonId: '' })))?.ok).toBe(true);
    expect(row.loss_reason_id).toBeNull();
  });

  it('keeps archived reasons on existing records but disallows new assignments', async () => {
    reason = { id: reasonId, code: 'L1', is_active: false };
    expect((await createInquiry(null, form({ lossReasonId: reasonId })))?.ok).toBe(false);
    row.loss_reason_id = reasonId;
    expect((await updateInquiry(null, form({ lossReasonId: reasonId })))?.ok).toBe(true);
  });

  it('surfaces lookup/write errors without changing inquiry evidence', async () => {
    denyReasonWrite = true;
    expect((await updateInquiry(null, form()))?.error).toBe('Reason write denied');
    expect(row.loss_reason_id).toBeNull();
    failInquiryRead = true;
    expect((await updateInquiry(null, form()))?.error).toBe('Inquiry read denied');
    expect(requests.some((r) => r.method === 'PATCH')).toBe(false);
  });

  it.each(['viewer', 'marketing_admin', 'warehouse_admin'] as Role[])(
    'rejects %s before any data access',
    async (deniedRole) => {
      role = deniedRole;
      await expect(updateInquiry(null, form())).rejects.toThrow('Forbidden');
      expect(requests).toHaveLength(0);
    },
  );
});
