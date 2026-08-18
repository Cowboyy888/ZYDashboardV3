/**
 * Branded Deposit Invoice — pure, no DOM / no server deps.
 *
 * Self-contained HTML string, rendered to a real PDF server-side by
 * pdf.ts (see /api/export/deposit-invoice/[id]/pdf) and downloaded directly
 * — same pattern as quotation-doc-html.ts and sales-order-html.ts. Reuses
 * `esc()` from inquiry-report-html.ts so the documents never diverge on
 * escaping.
 *
 * Unlike the inquiry report (always $/m²), a deposit invoice's currency comes
 * from its sales order (USD/KHR/CNY), so amounts are formatted with a plain
 * `${currency} ${amount}` prefix.
 */
import { esc } from './inquiry-report-html';
import type { DepositInvoiceStatus } from '@/lib/domain/deposit-invoice';

export interface DepositInvoiceLineItem {
  skuLabel: string;
  unit: string;
  orderedQty: number;
  areaPerSheet: number | null;
  pricePerSqm: number | null;
  unitPrice: number; // price per sheet
  lineTotal: number;
}

export interface DepositInvoiceData {
  invoiceNumber: string;
  generatedOn: string; // dd/mm/yyyy
  currency: string;
  status: DepositInvoiceStatus;
  statusLabel: string;
  customer: {
    name: string;
    contactPerson: string | null;
    phone: string | null;
    address: string | null;
  };
  so: {
    soNumber: string;
    orderDate: string; // dd/mm/yyyy
  };
  items: DepositInvoiceLineItem[];
  totalOrderAmount: number;
  depositPercentage: number;
  depositAmount: number;
  remainingBalance: number;
}

function formatMoney(n: number, currency: string): string {
  return `${currency} ${n.toFixed(2)}`;
}
function formatArea(n: number | null): string {
  return n == null ? '—' : n.toFixed(3);
}

const RED = '#e31e24';
const HEADER_RED = '#b3141a';
const GREY = '#ededed';
const BANNER = '#fbf2f2';
const MUTED = '#6b6b6b';
const INK = '#1a1a1a';

/** A self-contained, print-optimized HTML document for a deposit invoice. */
export function buildDepositInvoiceHtml(data: DepositInvoiceData): string {
  const thead = `
    <th class="l">Product 产品</th>
    <th class="r">Price/m² 单价</th>
    <th class="r">Area/sheet (m²) 单张面积</th>
    <th class="r">Price/sheet 单张价</th>
    <th class="r">Qty 数量</th>
    <th class="r">Total 总额</th>
  `;

  const tbody =
    data.items.length === 0
      ? `<tr><td class="empty" colspan="6">No line items 暂无明细</td></tr>`
      : data.items
          .map(
            (item) => `<tr>
              <td class="l">${esc(item.skuLabel)}</td>
              <td class="r">${item.pricePerSqm == null ? '—' : formatMoney(item.pricePerSqm, data.currency)}</td>
              <td class="r">${formatArea(item.areaPerSheet)}</td>
              <td class="r">${formatMoney(item.unitPrice, data.currency)}</td>
              <td class="r">${item.orderedQty} ${esc(item.unit)}</td>
              <td class="r">${formatMoney(item.lineTotal, data.currency)}</td>
            </tr>`,
          )
          .join('');

  const summaryRow = (label: string, value: string, emphasise = false) => `
    <div class="summary-row${emphasise ? ' emphasise' : ''}">
      <span>${esc(label)}</span><span>${esc(value)}</span>
    </div>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>ZY Steel · Deposit Invoice ${esc(data.invoiceNumber)}</title>
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: Arial, "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif;
    color: ${INK};
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    padding: 22px;
  }
  .letterhead { display: flex; align-items: center; gap: 12px; }
  .logo { height: 46px; width: auto; }
  .brand { font-size: 24px; font-weight: 700; letter-spacing: .2px; }
  .sub { font-size: 10.5px; color: ${MUTED}; margin-top: 2px; }
  .bar {
    background: ${RED}; color: #fff; font-weight: 700; text-align: center;
    padding: 8px; margin: 14px 0; font-size: 14px; letter-spacing: .3px;
  }
  .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; font-size: 11px; margin-bottom: 14px; }
  .meta-grid .label { font-size: 9px; color: ${MUTED}; text-transform: uppercase; font-weight: 700; }
  table { width: 100%; border-collapse: collapse; font-size: 10px; margin-bottom: 14px; }
  th, td { border: 1px solid #cfcfcf; padding: 5px 6px; }
  thead th { background: ${HEADER_RED}; color: #fff; font-weight: 700; }
  th.l, td.l { text-align: left; }
  th.r, td.r { text-align: right; }
  tbody tr:nth-child(even) { background: #fafafa; }
  td.empty { text-align: center; color: ${MUTED}; padding: 16px; }
  .summary { border: 1px solid ${GREY}; border-left: 4px solid ${RED}; padding: 10px 14px; max-width: 320px; margin-left: auto; }
  .summary-row { display: flex; justify-content: space-between; font-size: 11px; padding: 3px 0; }
  .summary-row.emphasise { font-size: 14px; font-weight: 700; border-top: 1px solid ${GREY}; margin-top: 4px; padding-top: 8px; }
  .status { display: inline-block; margin-top: 8px; padding: 3px 10px; background: ${BANNER}; border: 1px solid ${RED}; color: ${HEADER_RED}; font-weight: 700; font-size: 10px; }
  .payment { margin-top: 14px; border-left: 4px solid ${RED}; padding: 8px 14px; font-size: 10px; }
  .payment-l { font-weight: 700; color: ${RED}; margin-bottom: 4px; text-transform: uppercase; font-size: 9px; }
  .footer {
    background: ${RED}; color: #fff; font-weight: 700; text-align: center;
    padding: 6px; margin-top: 14px; font-size: 9px;
  }
  @page { size: A4 portrait; margin: 12mm; }
</style>
</head>
<body>
  <div class="letterhead">
    <img src="/brand/zysteel-logo.png" alt="ZY Steel 中粤铁网" class="logo" />
    <div>
      <div class="brand">ZY STEEL&nbsp;&nbsp;中粤铁网</div>
      <div class="sub">Steel Mesh &amp; Wire Drawing Manufacturer&nbsp;·&nbsp;Phnom Penh, Cambodia</div>
    </div>
  </div>
  <div class="bar">DEPOSIT INVOICE · 定金发票</div>

  <div class="meta-grid">
    <div>
      <div class="label">Bill To 客户</div>
      <div><strong>${esc(data.customer.name)}</strong></div>
      ${data.customer.contactPerson ? `<div>${esc(data.customer.contactPerson)}</div>` : ''}
      ${data.customer.phone ? `<div>Tel: ${esc(data.customer.phone)}</div>` : ''}
      ${data.customer.address ? `<div>${esc(data.customer.address)}</div>` : ''}
    </div>
    <div>
      <div><span class="label">Invoice No.: </span>${esc(data.invoiceNumber)}</div>
      <div><span class="label">Date: </span>${esc(data.generatedOn)}</div>
      <div><span class="label">Order No.: </span>${esc(data.so.soNumber)} (${esc(data.so.orderDate)})</div>
      <div><span class="label">Currency: </span>${esc(data.currency)}</div>
      <div class="status">${esc(data.statusLabel)}</div>
    </div>
  </div>

  <table>
    <thead><tr>${thead}</tr></thead>
    <tbody>${tbody}</tbody>
  </table>

  <div class="summary">
    ${summaryRow('Total Order Amount', formatMoney(data.totalOrderAmount, data.currency))}
    ${summaryRow('Deposit Percentage', `${data.depositPercentage}%`)}
    ${summaryRow('Deposit Amount', formatMoney(data.depositAmount, data.currency), true)}
    ${summaryRow('Remaining Balance', formatMoney(data.remainingBalance, data.currency))}
  </div>

  <div class="payment">
    <div class="payment-l">Payment Details 付款信息</div>
    <div>Bank: ABA Bank &middot; Account Name: Ma Jiang Ou &middot; Account No.: 6686 88888</div>
    <div>Please quote Invoice No. ${esc(data.invoiceNumber)} when making payment.</div>
  </div>

  <div class="footer">ZY STEEL 中粤铁网 &middot; Phnom Penh, Cambodia &middot; Thank you for your business</div>
</body>
</html>`;
}
