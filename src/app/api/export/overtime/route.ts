import { type NextRequest } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { getEmployees, getOvertimeEntries, getOvertimeSettings } from '@/lib/db/queries';
import { employeeDisplayName } from '@/lib/domain/payroll-view';
import { summarizeOvertime, DEFAULT_TIER1_LABEL, DEFAULT_TIER2_LABEL } from '@/lib/domain/overtime';
import { businessDate, formatDDMMYYYY } from '@/lib/domain/datetime';
import { buildBrandedXlsx, USD_FMT, xlsxResponse, type XlsxColumn } from '@/lib/reports/xlsx';
import type { OvertimeEntryRow } from '@/lib/db/types';

export const dynamic = 'force-dynamic';

interface Row {
  entry: OvertimeEntryRow;
  employeeName: string;
}

export async function GET(request: NextRequest) {
  await requirePermission('overtime:view');

  const iso = /^\d{4}-\d{2}-\d{2}$/;
  const fromParam = request.nextUrl.searchParams.get('from');
  const toParam = request.nextUrl.searchParams.get('to');
  const from = iso.test(fromParam ?? '') ? fromParam! : undefined;
  const to = iso.test(toParam ?? '') ? toParam! : undefined;

  const [entries, settings, employees] = await Promise.all([
    getOvertimeEntries(from, to),
    getOvertimeSettings(),
    getEmployees(true),
  ]);

  const empName = new Map(employees.map((e) => [e.id, employeeDisplayName(e)]));
  const tier1Label = settings?.tier1_label ?? DEFAULT_TIER1_LABEL;
  const tier2Label = settings?.tier2_label ?? DEFAULT_TIER2_LABEL;

  const rows: Row[] = entries.map((entry) => ({
    entry,
    employeeName: empName.get(entry.employee_id) ?? entry.employee_id,
  }));

  const columns: XlsxColumn<Row>[] = [
    { header: 'Date 日期', width: 13, value: (r) => formatDDMMYYYY(r.entry.business_date) },
    { header: 'Employee 员工', width: 24, value: (r) => r.employeeName },
    { header: 'Task 工作内容', width: 16, value: (r) => r.entry.description ?? '' },
    { header: 'Time 时间段', width: 15, value: (r) => r.entry.time_range ?? '' },
    {
      header: `Hours ${tier1Label}`,
      width: 15,
      value: (r) => Number(r.entry.tier1_hours),
      numFmt: '#,##0.00',
    },
    {
      header: 'Amount 金额',
      width: 13,
      value: (r) => Number(r.entry.tier1_amount),
      numFmt: USD_FMT,
    },
    {
      header: `Hours ${tier2Label}`,
      width: 15,
      value: (r) => Number(r.entry.tier2_hours),
      numFmt: '#,##0.00',
    },
    {
      header: 'Amount 金额',
      width: 13,
      value: (r) => Number(r.entry.tier2_amount),
      numFmt: USD_FMT,
    },
    {
      header: 'Total 合计',
      width: 14,
      value: (r) => Number(r.entry.total_amount),
      numFmt: USD_FMT,
    },
  ];

  const s = summarizeOvertime(
    entries.map((e) => ({
      businessDate: e.business_date,
      employeeId: e.employee_id,
      description: e.description,
      tier1Hours: Number(e.tier1_hours),
      tier2Hours: Number(e.tier2_hours),
      tier1Amount: Number(e.tier1_amount),
      tier2Amount: Number(e.tier2_amount),
      totalAmount: Number(e.total_amount),
    })),
  );

  const today = businessDate();
  const period =
    from && to ? `${formatDDMMYYYY(from)} — ${formatDDMMYYYY(to)}` : 'All records 全部记录';

  const buffer = await buildBrandedXlsx({
    sheetName: 'Overtime',
    title: 'OVERTIME REPORT · 加班表',
    metaLeft: [
      { label: 'PERIOD:', value: period },
      { label: 'RATES:', value: `${tier1Label} · ${tier2Label}` },
    ],
    metaRight: [
      { label: 'Generated:', value: formatDDMMYYYY(today) },
      { label: 'Entries:', value: String(s.entries) },
      { label: 'Employees:', value: String(s.people) },
    ],
    columns,
    rows,
    totals: [
      { label: `${tier1Label} hours 工时:`, value: s.tier1Hours, numFmt: '#,##0.00' },
      { label: `${tier1Label} amount 金额:`, value: s.tier1Amount, numFmt: USD_FMT },
      { label: `${tier2Label} hours 工时:`, value: s.tier2Hours, numFmt: '#,##0.00' },
      { label: `${tier2Label} amount 金额:`, value: s.tier2Amount, numFmt: USD_FMT },
      {
        label: 'TOTAL OVERTIME 加班费合计:',
        value: s.totalAmount,
        numFmt: USD_FMT,
        highlight: true,
      },
    ],
    notes: [
      `Tier 1 (${tier1Label}) amount = hours × $${Number(settings?.tier1_rate ?? 1.25).toFixed(2)}/h.`,
      `Tier 2 (${tier2Label}) amount = hours × $${Number(settings?.tier2_rate ?? 2).toFixed(2)}/h.`,
      'Total = tier 1 amount + tier 2 amount. 合计 = 第一时段金额 + 第二时段金额。',
      'Each entry keeps the rate it was recorded at. 每条记录保留录入时的费率。',
    ],
  });

  return xlsxResponse(buffer, `overtime-${from ?? 'all'}-to-${to ?? 'all'}.xlsx`);
}
