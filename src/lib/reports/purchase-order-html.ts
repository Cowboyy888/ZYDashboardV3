/**
 * Purchase Order letterhead document as print-ready HTML — same
 * self-contained, no-DOM/no-server-deps pattern as sales-order-html.ts and
 * the other branded reports, rendered to a real PDF server-side by pdf.ts
 * (see /api/purchasing/orders/[id]/pdf). Purchase orders are header-only —
 * no SKU line items, just the free-text product lines (see
 * purchasing-view.ts's "header-only" note) — so the items table is simpler
 * than the sales-order one.
 */
import { esc } from './inquiry-report-html';

export interface PurchaseOrderDocItem {
  productName: string;
  quantity: number | null;
  unit: string | null;
  unitPrice: number | null;
  lineTotal: number | null;
}

export interface PurchaseOrderDocData {
  poNumber: string;
  generatedOn: string; // dd/mm/yyyy
  orderDate: string; // dd/mm/yyyy
  currency: string;
  statusLabel: string;
  supplier: {
    name: string;
    contactPerson: string | null;
    phone: string | null;
    address: string | null;
  };
  notes: string | null;
  items: PurchaseOrderDocItem[];
}

const RED = '#e31e24';
const PINK = '#fbf2f2';
const MUTED = '#6b6b6b';
const INK = '#1a1a1a';

function money(n: number | null, currency: string): string {
  return n == null ? '—' : `${currency} ${n.toFixed(2)}`;
}
function qty(n: number | null, unit: string | null): string {
  if (n == null) return '—';
  return unit ? `${n} ${unit}` : String(n);
}

export function buildPurchaseOrderHtml(d: PurchaseOrderDocData): string {
  const thead = ['No. 序号', 'Product 产品', 'Quantity 数量', 'Unit Cost 单价', 'Line Total 小计']
    .map((h, n) => `<th class="${n === 1 ? 'l' : n === 0 ? 'c' : 'r'}">${esc(h)}</th>`)
    .join('');

  const tbody =
    d.items.length === 0
      ? `<tr><td class="empty" colspan="5">No products 暂无产品</td></tr>`
      : d.items
          .map(
            (item, i) => `<tr>
              <td class="c">${i + 1}</td>
              <td class="l">${esc(item.productName)}</td>
              <td class="r">${esc(qty(item.quantity, item.unit))}</td>
              <td class="r">${esc(money(item.unitPrice, d.currency))}</td>
              <td class="r">${esc(money(item.lineTotal, d.currency))}</td>
            </tr>`,
          )
          .join('');

  const grandTotal = d.items.reduce((s, it) => s + (it.lineTotal ?? 0), 0);

  const meta: Array<[string, string]> = [
    ['Purchase Order No.:', d.poNumber],
    ['Date:', d.orderDate],
    ['Currency:', d.currency],
    ['Status:', d.statusLabel],
  ];
  const metaHtml = meta
    .map(([l, v]) => `<tr><td class="ml">${esc(l)}</td><td class="mv">${esc(v)}</td></tr>`)
    .join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>ZY Steel · Purchase Order ${esc(d.poNumber)}</title>
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: Arial, "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif;
    color: ${INK};
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    padding: 24px 26px;
    font-size: 11px;
  }
  .letterhead { display: flex; align-items: center; gap: 12px; }
  .logo { height: 46px; width: auto; }
  .brand { font-size: 24px; font-weight: 700; letter-spacing: .3px; }
  .brand-zh { font-size: 13px; font-weight: 700; color: ${RED}; margin-top: 1px; }
  .sub { font-size: 9.5px; color: ${MUTED}; margin-top: 2px; }
  .bar {
    background: ${RED}; color: #fff; font-weight: 700; text-align: center;
    padding: 9px; margin: 16px 0 14px; font-size: 14px; letter-spacing: .3px;
  }
  .head { display: flex; justify-content: space-between; gap: 24px; margin-bottom: 14px; }
  .to-l { font-size: 9.5px; font-weight: 700; color: ${RED}; letter-spacing: .3px; }
  .to-v { font-size: 14px; font-weight: 700; margin: 2px 0 4px; }
  .to-line { font-size: 10px; color: ${INK}; }
  table.meta td { font-size: 10px; padding: 1.5px 0; }
  table.meta .ml { font-weight: 700; text-align: right; padding-right: 10px; white-space: nowrap; }
  table.meta .mv { text-align: right; white-space: nowrap; }
  table.items { width: 100%; border-collapse: collapse; font-size: 10px; }
  table.items th, table.items td { border: 1px solid #bfbfbf; padding: 6px 7px; }
  table.items thead th { background: ${RED}; color: #fff; font-weight: 700; }
  .l { text-align: left; } .r { text-align: right; } .c { text-align: center; }
  table.items td.empty { text-align: center; color: ${MUTED}; font-style: italic; padding: 16px; }
  .totals { margin-top: 12px; display: flex; justify-content: flex-end; }
  .totals table { border-collapse: collapse; font-size: 11px; }
  .totals .tl { text-align: right; font-weight: 700; padding: 4px 12px; white-space: nowrap; }
  .totals .tv { text-align: right; font-weight: 700; padding: 4px 12px; border: 1px solid #bfbfbf; min-width: 120px; }
  .totals tr.hi .tl, .totals tr.hi .tv { background: ${PINK}; color: ${RED}; }
  .notes { margin-top: 20px; font-size: 9.5px; }
  .notes h4 { margin: 0 0 6px; font-size: 10.5px; color: ${RED}; letter-spacing: .3px; }
  .sign { display: flex; justify-content: space-between; gap: 40px; margin-top: 42px; }
  .sign div { flex: 1; }
  .sign .role { font-size: 10.5px; font-weight: 700; margin-bottom: 34px; }
  .sign .rule { border-top: 1px solid ${INK}; width: 210px; }
  .sign .who { font-size: 9px; color: ${MUTED}; margin-top: 4px; }
  .footer {
    background: ${RED}; color: #fff; font-weight: 700; text-align: center;
    padding: 7px; margin-top: 26px; font-size: 9.5px;
  }
  @page { size: A4 portrait; margin: 12mm; }
</style>
</head>
<body>
  <div class="letterhead">
    <img src="/brand/zysteel-logo.png" alt="ZY Steel 中粤铁网" class="logo" />
    <div>
      <div class="brand">ZY STEEL</div>
      <div class="brand-zh">中粤铁网</div>
      <div class="sub">Steel Mesh &amp; Wire Drawing Manufacturer</div>
      <div class="sub">Phnom Penh, Kingdom of Cambodia</div>
    </div>
  </div>

  <div class="bar">PURCHASE ORDER · 采购订单</div>

  <div class="head">
    <div>
      <div class="to-l">SUPPLIER:</div>
      <div class="to-v">${esc(d.supplier.name)}</div>
      ${d.supplier.contactPerson ? `<div class="to-line">${esc(d.supplier.contactPerson)}</div>` : ''}
      ${d.supplier.phone ? `<div class="to-line">Tel: ${esc(d.supplier.phone)}</div>` : ''}
      ${d.supplier.address ? `<div class="to-line">${esc(d.supplier.address)}</div>` : ''}
    </div>
    <table class="meta">${metaHtml}</table>
  </div>

  <table class="items">
    <thead><tr>${thead}</tr></thead>
    <tbody>${tbody}</tbody>
  </table>

  <div class="totals"><table><tr class="hi"><td class="tl">Grand Total:</td><td class="tv">${esc(money(grandTotal, d.currency))}</td></tr></table></div>

  ${d.notes ? `<div class="notes"><h4>NOTES</h4><div>${esc(d.notes)}</div></div>` : ''}

  <div class="sign">
    <div>
      <div class="role">Prepared &amp; Issued By</div>
      <div class="rule"></div>
      <div class="who">ZY Steel (中粤铁网) · Purchasing Department</div>
    </div>
    <div>
      <div class="role">Acknowledged By (Supplier)</div>
      <div class="rule"></div>
      <div class="who">${esc(d.supplier.name)} &nbsp;&nbsp; Signature &amp; Date</div>
    </div>
  </div>

  <div class="footer">ZY STEEL 中粤铁网 · Phnom Penh, Cambodia</div>
</body>
</html>`;
}
