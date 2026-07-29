import { requirePermission } from '@/lib/auth';
import {
  getSalesOrders,
  getSalesOrderItems,
  getSalesOrderItemsDelivered,
  getCustomers,
  getSkus,
  getFamilies,
} from '@/lib/db/queries';
import { buildSalesOrderRows } from '@/lib/domain/sales-view';
import { SO_STATUS_LABELS } from '@/lib/domain/sales';
import { businessDate, formatDDMMYYYY } from '@/lib/domain/datetime';
import { getLocale } from '@/lib/i18n/locale';
import { buildXlsxBuffer, xlsxResponse, type XlsxColumn } from '@/lib/reports/xlsx';
import type { SalesOrderRow, SoItemRow } from '@/lib/domain/sales-view';

export const dynamic = 'force-dynamic';

interface ExportRow {
  so: SalesOrderRow;
  item: SoItemRow;
}

const COLUMNS: XlsxColumn<ExportRow>[] = [
  { header: 'SO Number 销售单号', width: 18, value: (r) => r.so.soNumber },
  { header: 'Customer 客户', width: 24, value: (r) => r.so.customerName },
  { header: 'Order Date 下单日期', width: 14, value: (r) => formatDDMMYYYY(r.so.orderDate) },
  {
    header: 'Expected Delivery 预计发货',
    width: 16,
    value: (r) => (r.so.expectedDeliveryDate ? formatDDMMYYYY(r.so.expectedDeliveryDate) : ''),
  },
  { header: 'Status 状态', width: 16, value: (r) => SO_STATUS_LABELS[r.so.status].en },
  { header: 'Product 产品', width: 34, value: (r) => r.item.skuLabel },
  { header: 'Unit 单位', width: 10, value: (r) => r.item.unit },
  {
    header: 'Ordered Qty 订购数量',
    width: 14,
    value: (r) => r.item.orderedQty,
    numFmt: '#,##0.###',
  },
  {
    header: 'Delivered Qty 已发货',
    width: 14,
    value: (r) => r.item.deliveredQty,
    numFmt: '#,##0.###',
  },
  { header: 'Currency 货币', width: 10, value: (r) => r.so.currency },
  { header: 'Unit Price 单价', width: 12, value: (r) => r.item.unitPrice, numFmt: '#,##0.00' },
  { header: 'Line Total 小计', width: 14, value: (r) => r.item.lineTotal, numFmt: '#,##0.00' },
];

export async function GET() {
  await requirePermission('sales:view');
  const locale = await getLocale();

  const [sos, items, delivered, customers, skus, families] = await Promise.all([
    getSalesOrders(),
    getSalesOrderItems(),
    getSalesOrderItemsDelivered(),
    getCustomers(true),
    getSkus(true),
    getFamilies(true),
  ]);

  const rows = buildSalesOrderRows(
    sos,
    items,
    delivered,
    customers,
    skus,
    families,
    businessDate(),
    locale,
  );

  const exportRows: ExportRow[] = rows.flatMap((so) => so.items.map((item) => ({ so, item })));

  const buffer = await buildXlsxBuffer('Sales Orders', COLUMNS, exportRows);
  return xlsxResponse(buffer, `sales-orders-${businessDate()}.xlsx`);
}
