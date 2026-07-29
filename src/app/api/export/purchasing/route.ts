import { requirePermission } from '@/lib/auth';
import {
  getPurchaseOrders,
  getPurchaseOrderItems,
  getPurchaseOrderItemsReceived,
  getSuppliers,
  getSkus,
  getFamilies,
} from '@/lib/db/queries';
import { buildPurchaseOrderRows } from '@/lib/domain/purchasing-view';
import { PO_STATUS_LABELS } from '@/lib/domain/purchasing';
import { businessDate, formatDDMMYYYY } from '@/lib/domain/datetime';
import { getLocale } from '@/lib/i18n/locale';
import { buildXlsxBuffer, xlsxResponse, type XlsxColumn } from '@/lib/reports/xlsx';
import type { PurchaseOrderRow, PoItemRow } from '@/lib/domain/purchasing-view';

export const dynamic = 'force-dynamic';

interface ExportRow {
  po: PurchaseOrderRow;
  item: PoItemRow;
}

const COLUMNS: XlsxColumn<ExportRow>[] = [
  { header: 'PO Number 采购单号', width: 18, value: (r) => r.po.poNumber },
  { header: 'Supplier 供应商', width: 24, value: (r) => r.po.supplierName },
  { header: 'Order Date 下单日期', width: 14, value: (r) => formatDDMMYYYY(r.po.orderDate) },
  {
    header: 'Expected Arrival 预计到货',
    width: 16,
    value: (r) => (r.po.expectedArrivalDate ? formatDDMMYYYY(r.po.expectedArrivalDate) : ''),
  },
  { header: 'Status 状态', width: 16, value: (r) => PO_STATUS_LABELS[r.po.status].en },
  { header: 'Product 产品', width: 34, value: (r) => r.item.skuLabel },
  { header: 'Unit 单位', width: 10, value: (r) => r.item.unit },
  {
    header: 'Ordered Qty 订购数量',
    width: 14,
    value: (r) => r.item.orderedQty,
    numFmt: '#,##0.###',
  },
  {
    header: 'Received Qty 已收货',
    width: 14,
    value: (r) => r.item.receivedQty,
    numFmt: '#,##0.###',
  },
  { header: 'Currency 货币', width: 10, value: (r) => r.po.currency },
  { header: 'Unit Cost 单价', width: 12, value: (r) => r.item.unitCost, numFmt: '#,##0.00' },
  { header: 'Line Total 小计', width: 14, value: (r) => r.item.lineTotal, numFmt: '#,##0.00' },
];

export async function GET() {
  await requirePermission('purchasing:view');
  const locale = await getLocale();

  const [pos, items, received, suppliers, skus, families] = await Promise.all([
    getPurchaseOrders(),
    getPurchaseOrderItems(),
    getPurchaseOrderItemsReceived(),
    getSuppliers(true),
    getSkus(true),
    getFamilies(true),
  ]);

  const rows = buildPurchaseOrderRows(
    pos,
    items,
    received,
    suppliers,
    skus,
    families,
    businessDate(),
    locale,
  );

  const exportRows: ExportRow[] = rows.flatMap((po) => po.items.map((item) => ({ po, item })));

  const buffer = await buildXlsxBuffer('Purchase Orders', COLUMNS, exportRows);
  return xlsxResponse(buffer, `purchase-orders-${businessDate()}.xlsx`);
}
