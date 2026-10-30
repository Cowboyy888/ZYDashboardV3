import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import DashboardPage from '@/app/(app)/dashboard/page';
import { requireUser, type CurrentUser } from '@/lib/auth';
import { getLocale } from '@/lib/i18n/locale';
import { translator } from '@/lib/i18n';
import type { Role } from '@/lib/domain/rbac';
import * as queries from '@/lib/db/queries';

vi.mock('@/lib/auth', () => ({ requireUser: vi.fn() }));
vi.mock('@/lib/i18n/locale', () => ({ getLocale: vi.fn() }));
vi.mock('@/app/(app)/dashboard/production-quick-entry', () => ({
  ProductionQuickEntry: () => createElement('div', { 'data-production-entry': true }),
}));
vi.mock('@/lib/db/queries', () => ({
  getEmployees: vi.fn(),
  getAttendanceForDate: vi.fn(),
  getAttendanceRateForRange: vi.fn(),
  getSkus: vi.fn(),
  getFamilies: vi.fn(),
  getLocations: vi.fn(),
  getBalances: vi.fn(),
  getProductionCountForDate: vi.fn(),
  getSalesOrderTodayCount: vi.fn(),
  getPendingDeliveryOrderCount: vi.fn(),
  getDraftPayrollRunCount: vi.fn(),
  getOpenInquiryCount: vi.fn(),
  getPriceRecordCounts: vi.fn(),
}));

const attendanceReads = ['getEmployees', 'getAttendanceForDate', 'getAttendanceRateForRange'];
const inventoryReads = [
  'getSkus',
  'getFamilies',
  'getLocations',
  'getBalances',
  'getProductionCountForDate',
];
const salesReads = ['getSalesOrderTodayCount', 'getPendingDeliveryOrderCount'];
const roleCases: {
  role: Role;
  attendance: boolean;
  inventory: boolean;
  sales: boolean;
  payroll: boolean;
  inquiries: boolean;
  prices: boolean;
}[] = [
  {
    role: 'owner',
    attendance: true,
    inventory: true,
    sales: true,
    payroll: true,
    inquiries: true,
    prices: true,
  },
  {
    role: 'system_admin',
    attendance: true,
    inventory: true,
    sales: true,
    payroll: true,
    inquiries: true,
    prices: true,
  },
  {
    role: 'attendance_admin',
    attendance: true,
    inventory: false,
    sales: false,
    payroll: false,
    inquiries: false,
    prices: false,
  },
  {
    role: 'warehouse_admin',
    attendance: false,
    inventory: true,
    sales: false,
    payroll: false,
    inquiries: false,
    prices: false,
  },
  {
    role: 'sales_admin',
    attendance: false,
    inventory: true,
    sales: true,
    payroll: false,
    inquiries: true,
    prices: true,
  },
  {
    role: 'marketing_admin',
    attendance: false,
    inventory: false,
    sales: false,
    payroll: false,
    inquiries: false,
    prices: false,
  },
  {
    role: 'payroll_admin',
    attendance: true,
    inventory: false,
    sales: false,
    payroll: true,
    inquiries: false,
    prices: false,
  },
  {
    role: 'viewer',
    attendance: true,
    inventory: true,
    sales: false,
    payroll: false,
    inquiries: false,
    prices: false,
  },
];

function signIn(role: Role) {
  vi.mocked(requireUser).mockResolvedValue({
    id: 'test-profile',
    email: 'test@example.invalid',
    fullName: 'Test',
    role,
    isActive: true,
    locale: 'en',
  } satisfies CurrentUser);
}

function htmlText(value: string) {
  return renderToStaticMarkup(createElement('span', null, value)).slice(6, -7);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getLocale).mockResolvedValue('en');
  for (const query of Object.values(queries)) {
    if (vi.isMockFunction(query)) query.mockResolvedValue([]);
  }
  vi.mocked(queries.getAttendanceRateForRange).mockResolvedValue(0.75);
  vi.mocked(queries.getProductionCountForDate).mockResolvedValue(42);
  vi.mocked(queries.getSalesOrderTodayCount).mockResolvedValue(3);
  vi.mocked(queries.getPendingDeliveryOrderCount).mockResolvedValue(2);
  vi.mocked(queries.getDraftPayrollRunCount).mockResolvedValue(1);
  vi.mocked(queries.getOpenInquiryCount).mockResolvedValue(4);
  vi.mocked(queries.getPriceRecordCounts).mockResolvedValue({
    active: 5,
    expired: 0,
    customerPrices: 2,
    specialPrices: 1,
    changedThisMonth: 3,
    expiringSoon: 1,
  });
});

describe('dashboard source authorization and rendered sections', () => {
  it.each(roleCases)('$role reads and displays only authorized domains', async (access) => {
    signIn(access.role);
    const html = renderToStaticMarkup(await DashboardPage());
    const expectedReads = new Set([
      ...(access.attendance ? attendanceReads : []),
      ...(access.inventory ? inventoryReads : []),
      ...(access.sales ? salesReads : []),
      ...(access.payroll ? ['getDraftPayrollRunCount'] : []),
      ...(access.inquiries ? ['getOpenInquiryCount'] : []),
      ...(access.prices ? ['getPriceRecordCounts'] : []),
    ]);
    for (const [name, query] of Object.entries(queries)) {
      expect(query, `${access.role}: ${name}`).toHaveBeenCalledTimes(
        expectedReads.has(name) ? 1 : 0,
      );
    }
    const t = translator('en');
    for (const [allowed, labels] of [
      [
        access.attendance,
        ['dash.morningAtt', 'dash.afternoonAtt', 'dash.mtdRate', 'dash.attExceptions'],
      ],
      [access.inventory, ['dash.inventoryTotals', 'dash.lowStock', 'dash.productionToday']],
      [access.sales, ['dash.salesToday', 'dash.pendingDeliveries']],
      [access.payroll, ['dash.payrollApprovals']],
      [access.inquiries, ['dash.openInquiries']],
      [access.prices, ['pr.dashCard']],
    ] as const) {
      for (const label of labels)
        expect(html.includes(htmlText(t(label))), `${access.role}: ${label}`).toBe(allowed);
    }
  });

  it('does not reuse privileged data when the next request has fewer permissions', async () => {
    signIn('owner');
    expect(renderToStaticMarkup(await DashboardPage())).toContain(
      translator('en')('dash.attExceptions'),
    );
    vi.clearAllMocks();
    signIn('marketing_admin');
    const html = renderToStaticMarkup(await DashboardPage());
    for (const query of Object.values(queries)) expect(query).not.toHaveBeenCalled();
    expect(html).not.toContain('href="/attendance"');
    expect(html).not.toContain('href="/inventory"');
  });

  it('fails before issuing data reads when the user guard rejects the request', async () => {
    vi.mocked(requireUser).mockRejectedValueOnce(new Error('NEXT_REDIRECT'));
    await expect(DashboardPage()).rejects.toThrow('NEXT_REDIRECT');
    for (const query of Object.values(queries)) expect(query).not.toHaveBeenCalled();
  });

  it.each(['en', 'zh'] as const)('retains authorized sections in %s', async (locale) => {
    signIn('viewer');
    vi.mocked(getLocale).mockResolvedValue(locale);
    const html = renderToStaticMarkup(await DashboardPage());
    expect(html).toContain(translator(locale)('dash.inventoryTotals'));
    expect(html).toContain(translator(locale)('dash.attExceptions'));
  });

  it.each([
    ['owner', true],
    ['warehouse_admin', true],
    ['system_admin', false],
    ['sales_admin', false],
    ['viewer', false],
  ] as const)('keeps production entry restricted for %s', async (role, allowed) => {
    signIn(role);
    vi.mocked(queries.getLocations).mockResolvedValue([
      {
        id: 'warehouse',
        code: 'warehouse',
        name: 'Warehouse',
        is_active: true,
        created_at: '',
      },
    ]);
    const html = renderToStaticMarkup(await DashboardPage());
    expect(html.includes('data-production-entry')).toBe(allowed);
  });
});
