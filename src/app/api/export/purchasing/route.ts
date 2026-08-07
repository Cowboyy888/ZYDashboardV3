import { type NextRequest } from 'next/server';
import { requirePermission } from '@/lib/auth';
import {
  getPurchaseOrders,
  getPurchaseOrderItems,
  getSuppliers,
  getSkus,
  getFamilies,
  type PurchaseOrderFilters,
} from '@/lib/db/queries';
import {
  buildPurchaseOrderRows,
  type PurchaseOrderRow,
  type PoItemRow,
} from '@/lib/domain/purchasing-view';
import { isPoStatus, PO_STATUS_LABELS, type PoStatus } from '@/lib/domain/purchasing';
import { getLocale } from '@/lib/i18n/locale';
import { businessDate, formatDDMMYYYY } from '@/lib/domain/datetime';
import {
  buildXlsxBuffer,
  xlsxResponse,
  USD_FMT,
  NUM_FMT,
  type XlsxColumn,
} from '@/lib/reports/xlsx';
import { PO_REPORT_COLUMNS, toPoReportRow } from '@/lib/reports/purchase-order-report-html';

export const dynamic = 'force-dynamic';

interface ExportRow {
  po: PurchaseOrderRow;
  item: PoItemRow | null;
}

export async function GET(request: NextRequest) {
  await requirePermission('purchasing:view');
  const locale = await getLocale();
  const sp = request.nextUrl.searchParams;
  const iso = /^\d{4}-\d{2}-\d{2}$/;

  const filters: PurchaseOrderFilters = {
    poNumber: sp.get('po')?.trim() || undefined,
    supplierId: sp.get('supplierId') || undefined,
    status: isPoStatus(sp.get('status')) ? (sp.get('status') as PoStatus) : undefined,
    from: iso.test(sp.get('from') ?? '') ? sp.get('from')! : undefined,
    to: iso.test(sp.get('to') ?? '') ? sp.get('to')! : undefined,
    familyId: sp.get('familyId') || undefined,
  };

  const [pos, items, suppliers, skus, families] = await Promise.all([
    getPurchaseOrders(filters),
    getPurchaseOrderItems(),
    getSuppliers(true),
    getSkus(true),
    getFamilies(true),
  ]);
  const rows = buildPurchaseOrderRows(pos, items, suppliers, skus, families, locale);

  const exportRows: ExportRow[] = rows.flatMap((po): ExportRow[] =>
    po.items.length ? po.items.map((item) => ({ po, item })) : [{ po, item: null }],
  );

  const columns: XlsxColumn<ExportRow>[] = PO_REPORT_COLUMNS.map((c) => ({
    header: c.header,
    width: c.width,
    numFmt: c.kind === 'usd' ? USD_FMT : c.kind === 'num' ? NUM_FMT : undefined,
    value: (r) => {
      const row = toPoReportRow(r.po, r.item, PO_STATUS_LABELS[r.po.status]?.en ?? r.po.status);
      return row[c.key] ?? '';
    },
  }));

  const today = businessDate();
  const currencies = [...new Set(rows.map((r) => r.currency))];
  const grandTotalByCurrency: Record<string, number> = {};
  for (const r of rows) {
    grandTotalByCurrency[r.currency] = (grandTotalByCurrency[r.currency] ?? 0) + r.grandTotal;
  }

  const buffer = await buildXlsxBuffer('Purchase Orders', columns, exportRows, {
    title: 'PURCHASE ORDERS REPORT · 采购订单报表',
    metaLeft: [{ label: 'REPORT:', value: 'Purchase Orders (filtered) 采购订单（已筛选）' }],
    metaRight: [
      { label: 'Generated:', value: formatDDMMYYYY(today) },
      { label: 'Orders:', value: String(rows.length) },
      { label: 'Currency:', value: currencies.join(', ') || 'USD' },
    ],
    totals: [
      { label: 'Order lines 明细行数:', value: exportRows.length },
      ...Object.entries(grandTotalByCurrency).map(([cur, amt]) => ({
        label: `Total (${cur}) 总额:`,
        value: amt,
        numFmt: '#,##0.00',
        highlight: true,
      })),
    ],
    notes: ['Line Total = Ordered Qty × Unit Cost. 小计 = 订购数量 × 单价。'],
  });
  return xlsxResponse(buffer, `purchase-orders-${today}.xlsx`);
}
