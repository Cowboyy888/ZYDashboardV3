import { requirePermission } from '@/lib/auth';
import {
  getPayrollRun,
  getPayrollItems,
  getPayrollItemDeductions,
  getPayrollRunLines,
  getEmployees,
} from '@/lib/db/queries';
import { buildPayrollRunRows } from '@/lib/domain/payroll-view';
import { PAYROLL_STATUS_LABELS } from '@/lib/domain/payroll';
import { formatDDMMYYYY } from '@/lib/domain/datetime';
import { buildXlsxBuffer, xlsxResponse, type XlsxColumn } from '@/lib/reports/xlsx';
import type { PayrollItemRow } from '@/lib/domain/payroll-view';

export const dynamic = 'force-dynamic';

const COLUMNS: XlsxColumn<PayrollItemRow>[] = [
  { header: 'Employee Code 员工编号', width: 14, value: (r) => r.employeeCode },
  { header: 'Employee Name 姓名', width: 22, value: (r) => r.employeeName },
  { header: 'Days Worked 出勤天数', width: 14, value: (r) => r.daysWorked ?? 0, numFmt: '#,##0' },
  { header: 'Daily Rate 日薪', width: 12, value: (r) => r.rate, numFmt: '#,##0.00' },
  { header: 'Base Amount 基本工资', width: 14, value: (r) => r.baseAmount, numFmt: '#,##0.00' },
  {
    header: 'Overtime 加班费',
    width: 14,
    value: (r) => r.overtimeAmount,
    numFmt: '#,##0.00',
  },
  {
    header: 'Deductions 扣款',
    width: 14,
    value: (r) => r.deductionsTotal,
    numFmt: '#,##0.00',
  },
  { header: 'Net Amount 实发工资', width: 14, value: (r) => r.netAmount, numFmt: '#,##0.00' },
];

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requirePermission('payroll:view');
  const { id } = await params;

  const run = await getPayrollRun(id);
  if (!run) return new Response('Not found', { status: 404 });

  const [items, employees] = await Promise.all([getPayrollItems(id), getEmployees(true)]);
  const itemIds = items.map((i) => i.id);
  const [deductions, lines] = await Promise.all([
    getPayrollItemDeductions(itemIds),
    getPayrollRunLines(itemIds),
  ]);

  const rows = buildPayrollRunRows([run], items, deductions, lines, employees);
  const row = rows[0];
  if (!row) return new Response('Not found', { status: 404 });

  const sheetName = `Payroll ${row.periodStart} to ${row.periodEnd}`.slice(0, 31);
  const buffer = await buildXlsxBuffer(sheetName, COLUMNS, row.items, {
    title: 'PAYROLL REPORT · 工资表',
    metaLeft: [
      {
        label: 'PERIOD:',
        value: `${formatDDMMYYYY(row.periodStart)} — ${formatDDMMYYYY(row.periodEnd)}`,
      },
      { label: 'STATUS:', value: PAYROLL_STATUS_LABELS[row.status].en },
    ],
    metaRight: [
      { label: 'Pay date:', value: formatDDMMYYYY(row.payDate) },
      { label: 'Employees:', value: String(row.itemCount) },
      { label: 'Currency:', value: 'US Dollar (USD)' },
    ],
    totals: [
      { label: 'Gross (base) 基本工资合计:', value: row.grossTotal, numFmt: '#,##0.00' },
      { label: 'Overtime 加班费合计:', value: row.overtimeTotal, numFmt: '#,##0.00' },
      { label: 'Deductions 扣款合计:', value: row.deductionsTotal, numFmt: '#,##0.00' },
      { label: 'NET PAYABLE 实发合计:', value: row.netTotal, numFmt: '#,##0.00', highlight: true },
    ],
    notes: [
      'Base pay = daily rate × distinct days worked (present or late). 基本工资 = 日薪 × 出勤天数。',
      'Net = base + overtime − deductions. 实发 = 基本工资 + 加班费 − 扣款。',
      'Confidential — for internal payroll use only. 机密，仅限内部工资使用。',
    ],
  });

  const filename = `payroll-${row.periodStart}-to-${row.periodEnd}-${PAYROLL_STATUS_LABELS[row.status].en.toLowerCase()}.xlsx`;
  return xlsxResponse(buffer, filename);
}
