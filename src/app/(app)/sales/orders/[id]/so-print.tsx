import { CURRENCY_LABELS } from '@/lib/domain/sales';
import { formatDDMMYYYY } from '@/lib/domain/datetime';
import type { SalesOrderRow } from '@/lib/domain/sales-view';
import type { SalesOrderRow as SoRow, CustomerRow } from '@/lib/db/types';

/**
 * Print-only letterhead document for a sales order — styled after ZY Steel's
 * paper quotation template (red band header/footer, bilingual company block,
 * numbered terms, signature lines). Rendered `hidden print:block` so it never
 * shows on screen; `so-detail.tsx` hides its normal card layout with
 * `print:hidden` instead, so printing the page yields only this document.
 */
export function SoPrint({
  row,
  so,
  customer,
  locale,
}: {
  row: SalesOrderRow;
  so: SoRow;
  customer: CustomerRow | null;
  locale: 'en' | 'zh';
}) {
  const currencyLabel =
    CURRENCY_LABELS[row.currency as keyof typeof CURRENCY_LABELS]?.[locale] ?? row.currency;
  const money = (n: number) => `${row.currency} ${n.toFixed(2)}`;
  const grandTotal = row.grandTotal;

  return (
    <div className="hidden bg-white text-black print:block">
      <div className="flex items-start justify-between gap-4 pb-3">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/zysteel-logo.png" alt="中粤铁网 Zysteel" className="h-14 w-auto" />
          <div>
            <div className="text-xl font-bold leading-tight">ZY STEEL</div>
            <div className="text-sm font-semibold leading-tight">中粤铁网</div>
            <div className="text-xs leading-tight">Steel Mesh &amp; Wire Drawing Manufacturer</div>
            <div className="text-xs leading-tight">Phnom Penh, Kingdom of Cambodia</div>
          </div>
        </div>
      </div>

      <div className="bg-primary py-1.5 text-center text-sm font-bold uppercase tracking-wide text-primary-foreground">
        Sales Order &middot; 销售订单
      </div>

      <div className="grid grid-cols-2 gap-4 py-3 text-xs">
        <div>
          <div className="text-[10px] font-bold uppercase text-primary">Order To:</div>
          <div className="text-sm font-bold">{row.customerName}</div>
          {customer?.contact_person && <div>{customer.contact_person}</div>}
          {customer?.phone && <div>Tel: {customer.phone}</div>}
          {customer?.address && <div>{customer.address}</div>}
        </div>
        <div className="text-right">
          <div>
            <span className="font-semibold">Sales Order No.: </span>
            {row.soNumber}
          </div>
          <div>
            <span className="font-semibold">Date: </span>
            {formatDDMMYYYY(row.orderDate)}
          </div>
          <div>
            <span className="font-semibold">Expected Delivery: </span>
            {row.expectedDeliveryDate ? formatDDMMYYYY(row.expectedDeliveryDate) : '—'}
          </div>
          <div>
            <span className="font-semibold">Currency: </span>
            {currencyLabel}
          </div>
        </div>
      </div>

      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="bg-primary text-primary-foreground">
            <th className="border border-primary p-1.5 text-left">No.</th>
            <th className="border border-primary p-1.5 text-left">Product Description</th>
            <th className="border border-primary p-1.5 text-center">Unit</th>
            <th className="border border-primary p-1.5 text-right">Unit Price</th>
            <th className="border border-primary p-1.5 text-right">Quantity</th>
            <th className="border border-primary p-1.5 text-right">Line Total</th>
          </tr>
        </thead>
        <tbody>
          {row.items.map((item, i) => (
            <tr key={item.itemId}>
              <td className="border border-border p-1.5">{i + 1}</td>
              <td className="border border-border p-1.5">{item.skuLabel}</td>
              <td className="border border-border p-1.5 text-center">{item.unit}</td>
              <td className="border border-border p-1.5 text-right tabular-nums">
                {money(item.unitPrice)}
              </td>
              <td className="border border-border p-1.5 text-right tabular-nums">
                {item.orderedQty}
              </td>
              <td className="border border-border p-1.5 text-right tabular-nums">
                {money(item.lineTotal)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={5} className="border border-border p-1.5 text-right font-bold">
              Grand Total
            </td>
            <td className="border border-border p-1.5 text-right font-bold tabular-nums">
              {money(grandTotal)}
            </td>
          </tr>
        </tfoot>
      </table>

      <div className="pt-3 text-xs">
        <div className="text-[10px] font-bold uppercase text-primary">Terms &amp; Conditions</div>
        <ol className="list-decimal space-y-0.5 pl-4 pt-1">
          <li>All prices are quoted in {currencyLabel}.</li>
          <li>
            Prices are ex-factory, Phnom Penh. Delivery and transport can be arranged and quoted
            separately.
          </li>
          <li>
            Payment terms: {customer?.payment_terms || 'to be agreed upon order confirmation'}.
          </li>
          <li>Goods are supplied per the specification and quantity listed above.</li>
          {so.notes && <li>Notes: {so.notes}</li>}
        </ol>
      </div>

      <div className="grid grid-cols-2 gap-8 pt-10 text-xs">
        <div>
          <div className="mb-8 font-semibold">Prepared &amp; Issued By</div>
          <div className="border-t border-black pt-1">
            ZY Steel (中粤铁网) &middot; Sales Department
          </div>
        </div>
        <div>
          <div className="mb-8 font-semibold">Accepted By (Customer)</div>
          <div className="border-t border-black pt-1">
            {row.customerName} &middot; Signature &amp; Date
          </div>
        </div>
      </div>

      <div className="mt-6 bg-primary py-1.5 text-center text-[11px] text-primary-foreground">
        ZY STEEL 中粤铁网 &middot; Phnom Penh, Cambodia &middot; Thank you for your business
      </div>
    </div>
  );
}
