import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import * as queries from '@/lib/db/queries';

vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: vi.fn() }));

const requests: { url: URL; method: string }[] = [];
let lookup: (() => Promise<Response>) | undefined;
let attendanceCounts = { attended: 1000, resolved: 1500 };
let attendanceError = false;

beforeEach(() => {
  requests.length = 0;
  lookup = undefined;
  attendanceCounts = { attended: 1000, resolved: 1500 };
  attendanceError = false;
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    requests.push({ url, method });
    if (url.pathname.endsWith('/price_types')) {
      return lookup ? lookup() : new Response(JSON.stringify({ id: 'special' }), { status: 200 });
    }
    if (url.pathname.endsWith('/attendance') && attendanceError) {
      return new Response(JSON.stringify({ message: 'Query denied' }), { status: 403 });
    }
    const count = url.pathname.endsWith('/attendance')
      ? url.searchParams.get('status') === 'in.(present,late)'
        ? attendanceCounts.attended
        : attendanceCounts.resolved
      : 7;
    return new Response(null, {
      status: 200,
      headers: { 'content-range': `*/${count}`, 'content-type': 'application/json' },
    });
  };
  vi.mocked(createSupabaseServerClient).mockResolvedValue(
    createClient('https://dashboard-test.invalid', 'test-publishable-key', {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: fetcher },
    }),
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('dashboard data correctness and request cost', () => {
  it('calculates monthly attendance beyond the 1,000-row API cap without downloading rows', async () => {
    const rate = await queries.getAttendanceRateForRange('2026-10-01', '2026-10-29');
    expect(rate).toBeCloseTo(1000 / 1500);
    expect(requests).toHaveLength(2);
    for (const request of requests) {
      expect(request.method).toBe('HEAD');
      expect(request.url.searchParams.getAll('business_date')).toEqual([
        'gte.2026-10-01',
        'lte.2026-10-29',
      ]);
    }
    expect(requests.map((r) => r.url.searchParams.get('status')).sort()).toEqual([
      'in.(present,late)',
      'neq.leave',
    ]);
  });

  it('returns zero for an empty period and does not fabricate a ratio on query failure', async () => {
    attendanceCounts = { attended: 0, resolved: 0 };
    expect(await queries.getAttendanceRateForRange('2026-10-01', '2026-10-29')).toBe(0);
    attendanceError = true;
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await queries.getAttendanceRateForRange('2026-10-01', '2026-10-29')).toBe(0);
    expect(log).toHaveBeenCalledOnce();
  });

  it('keeps the other price counts when no Special Price type is configured', async () => {
    lookup = () => Promise.resolve(new Response('null', { status: 200 }));
    expect(await queries.getPriceRecordCounts()).toMatchObject({ active: 7, specialPrices: 0 });
    expect(requests.filter((r) => r.url.pathname.endsWith('/price_records'))).toHaveLength(5);
  });

  it('uses Bangkok dates for expiry and a UTC instant for local month start', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    // It is already 01/11 in Bangkok while UTC is still 31/10.
    vi.setSystemTime(new Date('2026-10-31T18:30:00Z'));
    const counts = await queries.getPriceRecordCounts();
    expect(counts.active).toBe(7);
    const expiry = requests.find((r) => r.url.searchParams.has('expiry_date'))!;
    expect(expiry.url.searchParams.getAll('expiry_date')).toEqual([
      'gte.2026-11-01',
      'lte.2026-12-01',
    ]);
    const changed = requests.find((r) => r.url.searchParams.has('created_at'))!;
    expect(changed.url.searchParams.get('created_at')).toBe('gte.2026-10-31T17:00:00.000Z');
  });

  it('starts five independent price counts while the special-type lookup is pending', async () => {
    let release!: () => void;
    lookup = () =>
      new Promise((resolve) => {
        release = () => resolve(new Response(JSON.stringify({ id: 'special' }), { status: 200 }));
      });
    const counts = queries.getPriceRecordCounts();
    try {
      await vi.waitFor(
        () => {
          expect(requests.filter((r) => r.url.pathname.endsWith('/price_records'))).toHaveLength(5);
        },
        { timeout: 250 },
      );
    } finally {
      release();
      await counts;
    }
    expect(requests.filter((r) => r.url.pathname.endsWith('/price_records'))).toHaveLength(6);
  });
});
