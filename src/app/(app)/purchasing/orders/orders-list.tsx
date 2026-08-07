'use client';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useT } from '@/components/i18n-provider';
import { PO_STATUS_LABELS, PO_STATUSES, type PoStatus } from '@/lib/domain/purchasing';
import { formatDDMMYYYY, businessDate } from '@/lib/domain/datetime';
import {
  buildPurchaseOrderReportHtml,
  describePurchaseOrderFilters,
  toPoReportRow,
} from '@/lib/reports/purchase-order-report-html';
import type { PurchaseOrderRow } from '@/lib/domain/purchasing-view';

const selectCls =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

const STATUS_VARIANT: Record<PoStatus, 'secondary' | 'destructive' | 'outline'> = {
  draft: 'outline',
  ordered: 'secondary',
  cancelled: 'destructive',
};

export interface OrdersListFilters {
  po: string;
  supplierId: string;
  status: string;
  from: string;
  to: string;
  familyId: string;
}

export function OrdersList({
  rows,
  suppliers,
  families,
  filters,
}: {
  rows: PurchaseOrderRow[];
  suppliers: { id: string; name: string }[];
  families: { id: string; name: string }[];
  filters: OrdersListFilters;
}) {
  const { t, locale } = useT();
  const router = useRouter();

  const [po, setPo] = useState(filters.po);
  const [supplierId, setSupplierId] = useState(filters.supplierId);
  const [status, setStatus] = useState(filters.status);
  const [from, setFrom] = useState(filters.from);
  const [to, setTo] = useState(filters.to);
  const [familyId, setFamilyId] = useState(filters.familyId);
  const [pdfError, setPdfError] = useState<string | null>(null);

  function buildQuery(f: OrdersListFilters): string {
    const p = new URLSearchParams();
    if (f.po) p.set('po', f.po);
    if (f.supplierId) p.set('supplierId', f.supplierId);
    if (f.status) p.set('status', f.status);
    if (f.from) p.set('from', f.from);
    if (f.to) p.set('to', f.to);
    if (f.familyId) p.set('familyId', f.familyId);
    return p.toString();
  }

  function applyFilters() {
    const q = buildQuery({ po, supplierId, status, from, to, familyId });
    router.push(`/purchasing/orders${q ? `?${q}` : ''}`);
  }
  function clearFilters() {
    setPo('');
    setSupplierId('');
    setStatus('');
    setFrom('');
    setTo('');
    setFamilyId('');
    router.push('/purchasing/orders');
  }

  // Export query string built from the APPLIED filters prop (not local input
  // state) so both exports always match what's actually on screen — same
  // contract as /api/export/overtime's from/to query string.
  const exportQuery = useMemo(() => buildQuery(filters), [filters]);

  function downloadPdf() {
    setPdfError(null);
    // Opened synchronously, in this click gesture — mobile browsers block a
    // deferred window.open()/print() (see this session's Deposit Invoice /
    // Inquiries print fixes).
    const w = window.open('', '_blank', 'width=1200,height=800');
    if (!w) {
      setPdfError(t('common.popupBlocked'));
      return;
    }
    const supplierName = suppliers.find((s) => s.id === filters.supplierId)?.name;
    const familyLabel = families.find((f) => f.id === filters.familyId)?.name;
    const statusLabel = filters.status
      ? (PO_STATUS_LABELS[filters.status as PoStatus]?.en ?? filters.status)
      : undefined;

    const grandTotalByCurrency: Record<string, number> = {};
    for (const r of rows) {
      grandTotalByCurrency[r.currency] = (grandTotalByCurrency[r.currency] ?? 0) + r.grandTotal;
    }

    const html = buildPurchaseOrderReportHtml({
      generatedOn: formatDDMMYYYY(businessDate()),
      filtersSummary: describePurchaseOrderFilters({
        poNumber: filters.po,
        supplierName,
        statusLabel,
        from: filters.from,
        to: filters.to,
        familyName: familyLabel,
      }),
      rows: rows.flatMap((r) =>
        r.items.length
          ? r.items.map((it) => toPoReportRow(r, it, PO_STATUS_LABELS[r.status]?.en ?? r.status))
          : [toPoReportRow(r, null, PO_STATUS_LABELS[r.status]?.en ?? r.status)],
      ),
      orderCount: rows.length,
      grandTotalByCurrency,
    });
    w.document.open();
    w.document.write(html);
    w.document.close();
    w.focus();
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="grid gap-3 p-4 sm:grid-cols-3 lg:grid-cols-6">
          <div className="space-y-1.5">
            <Label htmlFor="f-po" className="text-xs">
              {t('pur.filterPoNumber')}
            </Label>
            <Input id="f-po" value={po} onChange={(e) => setPo(e.target.value)} className="h-9" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="f-supplier" className="text-xs">
              {t('pur.supplier')}
            </Label>
            <select
              id="f-supplier"
              className={selectCls}
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
            >
              <option value="">{t('pur.allSuppliers')}</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="f-status" className="text-xs">
              {t('common.status')}
            </Label>
            <select
              id="f-status"
              className={selectCls}
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="">{t('pur.allStatuses')}</option>
              {PO_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {PO_STATUS_LABELS[s][locale]}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="f-from" className="text-xs">
              {t('pur.from')}
            </Label>
            <Input
              id="f-from"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="h-9"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="f-to" className="text-xs">
              {t('pur.to')}
            </Label>
            <Input
              id="f-to"
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="h-9"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="f-family" className="text-xs">
              {t('pur.filterItem')}
            </Label>
            <select
              id="f-family"
              className={selectCls}
              value={familyId}
              onChange={(e) => setFamilyId(e.target.value)}
            >
              <option value="">{t('pur.allItems')}</option>
              {families.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-2 sm:col-span-3 lg:col-span-6 lg:justify-end">
            <Button variant="outline" onClick={clearFilters}>
              {t('pur.clearFilters')}
            </Button>
            <Button onClick={applyFilters}>{t('pur.applyFilters')}</Button>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap justify-end gap-2">
        <Button asChild variant="outline">
          <a href={`/api/export/purchasing${exportQuery ? `?${exportQuery}` : ''}`}>
            {t('pur.downloadExcel')}
          </a>
        </Button>
        <div className="flex flex-col items-end gap-1">
          <Button variant="outline" onClick={downloadPdf}>
            {t('pur.downloadPdf')}
          </Button>
          {pdfError && <span className="text-xs text-destructive">{pdfError}</span>}
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('pur.poNumber')}</TableHead>
                <TableHead>{t('pur.supplier')}</TableHead>
                <TableHead>{t('pur.orderDate')}</TableHead>
                <TableHead className="text-right">{t('pur.lineItems')}</TableHead>
                <TableHead className="text-right">{t('pur.amount')}</TableHead>
                <TableHead>{t('common.status')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.poId}>
                  <TableCell>
                    <Link
                      href={`/purchasing/orders/${r.poId}`}
                      className="font-medium text-primary underline"
                    >
                      {r.poNumber}
                    </Link>
                  </TableCell>
                  <TableCell>{r.supplierName}</TableCell>
                  <TableCell>{formatDDMMYYYY(r.orderDate)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.itemCount} {t('pur.itemsSuffix')}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.currency} {r.grandTotal.toFixed(2)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[r.status] ?? 'outline'}>
                      {PO_STATUS_LABELS[r.status]?.[locale] ?? r.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    {t('pur.noOrders')}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
