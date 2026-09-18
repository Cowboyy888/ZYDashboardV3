import { requirePermission } from '@/lib/auth';
import { getQuotations, getQuotationItems } from '@/lib/db/queries';
import { quotationTotals, type QuotationTotals } from '@/lib/domain/quotation';
import { businessDate, formatDDMMYYYY } from '@/lib/domain/datetime';
import { buildXlsxBuffer, xlsxResponse, type XlsxColumn } from '@/lib/reports/xlsx';
import type { QuotationRow } from '@/lib/db/types';

export const dynamic = 'force-dynamic';

interface ExportRow {
  quotation: QuotationRow;
  totals: QuotationTotals;
}

const COLUMNS: XlsxColumn<ExportRow>[] = [
  { header: 'Quotation No. 报价单号', width: 16, value: (r) => r.quotation.quotation_no ?? '—' },
  { header: 'Customer 客户', width: 26, value: (r) => r.quotation.customer_name },
  {
    header: 'Quotation Date 报价日期',
    width: 14,
    value: (r) => formatDDMMYYYY(r.quotation.quotation_date),
  },
  { header: 'Currency 货币', width: 10, value: (r) => r.quotation.currency },
  { header: 'Subtotal 小计', width: 14, value: (r) => r.totals.subtotal, numFmt: '#,##0.00' },
  {
    header: 'Deposit % 订金比例',
    width: 12,
    value: (r) => r.totals.depositPercent,
    numFmt: '0.0"%"',
  },
  {
    header: 'Deposit Due 订金金额',
    width: 14,
    value: (r) => r.totals.depositDue,
    numFmt: '#,##0.00',
  },
  {
    header: 'Deposit Paid On 订金付款日',
    width: 16,
    value: (r) => (r.quotation.deposit_paid_on ? formatDDMMYYYY(r.quotation.deposit_paid_on) : ''),
  },
  {
    header: 'Balance Due 尾款金额',
    width: 14,
    value: (r) => r.totals.balanceDue,
    numFmt: '#,##0.00',
  },
  {
    header: 'Balance Paid On 尾款付款日',
    width: 16,
    // Always present — this report only ever contains balance-paid quotations.
    value: (r) => formatDDMMYYYY(r.quotation.balance_paid_on ?? ''),
  },
];

export async function GET(request: Request) {
  await requirePermission('sales:view');

  const params = new URL(request.url).searchParams;
  const from = params.get('from') || '';
  const to = params.get('to') || '';

  const allQuotations = await getQuotations();
  // The one filter this report exists for: settled quotations only, not the
  // full book — balance_paid_on is set exactly when the balance invoice has
  // been marked paid (markPaid() in actions/quotations.ts). An optional
  // from/to range further narrows to when the balance was actually paid, not
  // when the quotation was created — this report is about money collected.
  const quotations = allQuotations.filter((q) => {
    if (q.balance_paid_on == null) return false;
    if (from && q.balance_paid_on < from) return false;
    if (to && q.balance_paid_on > to) return false;
    return true;
  });

  const items = await getQuotationItems(quotations.map((q) => q.id));
  const itemsByQuotation = new Map<string, typeof items>();
  for (const item of items) {
    const list = itemsByQuotation.get(item.quotation_id) ?? [];
    list.push(item);
    itemsByQuotation.set(item.quotation_id, list);
  }

  const rows: ExportRow[] = quotations.map((quotation) => {
    const lines = (itemsByQuotation.get(quotation.id) ?? []).map((l) => ({
      unitPrice: Number(l.unit_price),
      quantity: Number(l.quantity),
    }));
    return { quotation, totals: quotationTotals(lines, quotation.deposit_pct) };
  });

  const today = businessDate();
  // "Balance paid" implies the deposit was collected first (deposit is always
  // invoiced before the balance) — the grand total a reader actually wants is
  // both legs together, not just the balance leg on its own.
  const depositCollected = rows.reduce((sum, r) => sum + r.totals.depositDue, 0);
  const balanceCollected = rows.reduce((sum, r) => sum + r.totals.balanceDue, 0);
  const totalCollected = depositCollected + balanceCollected;
  const currencies = [...new Set(rows.map((r) => r.quotation.currency))];

  const dateRangeLabel =
    from || to
      ? `${from ? formatDDMMYYYY(from) : '…'} – ${to ? formatDDMMYYYY(to) : '…'}`
      : 'All dates';

  const buffer = await buildXlsxBuffer('Balance Paid', COLUMNS, rows, {
    title: 'QUOTATIONS — BALANCE PAID · 报价单 — 尾款已付',
    metaLeft: [
      { label: 'REPORT:', value: 'Balance Paid Quotations 尾款已付报价单' },
      { label: 'Balance paid between:', value: dateRangeLabel },
    ],
    metaRight: [
      { label: 'Generated:', value: formatDDMMYYYY(today) },
      { label: 'Quotations:', value: String(rows.length) },
      { label: 'Currency:', value: currencies.join(', ') || 'USD' },
    ],
    totals: [
      { label: 'Quotations 数量:', value: rows.length },
      { label: 'Deposit Collected 订金合计:', value: depositCollected, numFmt: '#,##0.00' },
      { label: 'Balance Collected 尾款合计:', value: balanceCollected, numFmt: '#,##0.00' },
      {
        label: 'Total Collected (Deposit + Balance) 总计（订金+尾款）:',
        value: totalCollected,
        numFmt: '#,##0.00',
        highlight: true,
      },
    ],
    notes: ['Only quotations whose balance invoice has been marked paid are listed here.'],
  });
  const filenameSuffix = from || to ? `_${from || 'start'}_${to || 'end'}` : '';
  return xlsxResponse(buffer, `quotations-balance-paid-${today}${filenameSuffix}.xlsx`);
}
