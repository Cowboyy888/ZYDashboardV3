import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { createClient } from '@supabase/supabase-js';
import DashboardPage from '@/app/(app)/dashboard/page';
import { requireUser } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { Role } from '@/lib/domain/rbac';

vi.mock('@/lib/auth', () => ({ requireUser: vi.fn() }));
vi.mock('@/lib/i18n/locale', () => ({ getLocale: async () => 'en' }));
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: vi.fn() }));
vi.mock('@/app/(app)/dashboard/production-quick-entry', () => ({
  ProductionQuickEntry: () => createElement('div'),
}));

const requests: string[] = [];
beforeEach(() => {
  vi.clearAllMocks();
  requests.length = 0;
  vi.mocked(createSupabaseServerClient).mockResolvedValue(
    createClient('https://dashboard-test.invalid', 'test-publishable-key', {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: async (input, init) => {
          const url = new URL(String(input));
          requests.push(url.pathname.split('/').pop()!);
          return new Response(
            init?.method === 'HEAD'
              ? null
              : JSON.stringify(url.pathname.endsWith('/price_types') ? { id: 'special' } : []),
            {
              status: 200,
              headers: { 'content-range': '*/0', 'content-type': 'application/json' },
            },
          );
        },
      },
    }),
  );
});

describe('dashboard PostgREST request budget by role', () => {
  // Real query builders and page orchestration; transport is deterministic and
  // local. These are request counts, not latency or database-plan benchmarks.
  const budgets: [Role, number][] = [
    ['owner', 21],
    ['system_admin', 21],
    ['attendance_admin', 4],
    ['warehouse_admin', 5],
    ['sales_admin', 16],
    ['marketing_admin', 0],
    ['payroll_admin', 5],
    ['viewer', 9],
  ];
  it.each(budgets)('%s starts %i domain requests', async (role, expected) => {
    vi.mocked(requireUser).mockResolvedValue({
      id: 'test-profile',
      email: 'test@example.invalid',
      fullName: null,
      role,
      isActive: true,
      locale: 'en',
    });
    await DashboardPage();
    expect(requests).toHaveLength(expected);
    if (role === 'marketing_admin') expect(requests).toEqual([]);
    if (role === 'warehouse_admin' || role === 'sales_admin') {
      expect(requests).not.toContain('employees');
      expect(requests).not.toContain('attendance');
    }
  });
});
