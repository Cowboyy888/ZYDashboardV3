import { requirePermission } from '@/lib/auth';
import { getPurchaseOrders, getSuppliers } from '@/lib/db/queries';
import { buildPurchaseOrderRows } from '@/lib/domain/purchasing-view';
import { PO_STATUS_LABELS } from '@/lib/domain/purchasing';
import { businessDate, formatDDMMYYYY } from '@/lib/domain/datetime';
import { buildXlsxBuffer, xlsxResponse, type XlsxColumn } from '@/lib/reports/xlsx';
import type { PurchaseOrderRow } from '@/lib/domain/purchasing-view';

export const dynamic = 'force-dynamic';

const COLUMNS: XlsxColumn<PurchaseOrderRow>[] = [
  { header: 'PO Number 采购单号', width: 18, value: (r) => r.poNumber },
  { header: 'Supplier 供应商', width: 24, value: (r) => r.supplierName },
  { header: 'Order Date 下单日期', width: 14, value: (r) => formatDDMMYYYY(r.orderDate) },
  {
    header: 'Expected Arrival 预计到货',
    width: 16,
    value: (r) => (r.expectedArrivalDate ? formatDDMMYYYY(r.expectedArrivalDate) : ''),
  },
  { header: 'Status 状态', width: 16, value: (r) => PO_STATUS_LABELS[r.status]?.en ?? r.status },
  { header: 'Currency 货币', width: 10, value: (r) => r.currency },
  { header: 'Notes 备注', width: 30, value: (r) => r.notes ?? '' },
];

export async function GET() {
  await requirePermission('purchasing:view');

  const today = businessDate();
  const [pos, suppliers] = await Promise.all([getPurchaseOrders(), getSuppliers(true)]);
  const rows = buildPurchaseOrderRows(pos, suppliers, today);

  const open = rows.filter((r) => r.status !== 'cancelled').length;

  const buffer = await buildXlsxBuffer('Purchase Orders', COLUMNS, rows, {
    title: 'PURCHASE ORDERS REPORT · 采购订单报表',
    metaLeft: [{ label: 'REPORT:', value: 'Purchase Orders 采购订单' }],
    metaRight: [
      { label: 'Generated:', value: formatDDMMYYYY(today) },
      { label: 'Orders:', value: String(rows.length) },
      { label: 'Open:', value: String(open) },
    ],
    totals: [
      { label: 'Total orders 订单总数:', value: rows.length },
      { label: 'Open orders 未完成:', value: open, highlight: true },
    ],
  });
  return xlsxResponse(buffer, `purchase-orders-${today}.xlsx`);
}
