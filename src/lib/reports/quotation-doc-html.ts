/**
 * Quotation / Deposit invoice / Balance invoice as print-ready HTML — pure, no
 * DOM and no server deps, so it renders identically on the client (print →
 * Save as PDF) and in tests.
 *
 * Layout is a direct transcription of ZY_Steel_Quotation.xlsx: letterhead,
 * red title bar, "QUOTATION/INVOICE TO" block opposite the document meta, a
 * red-header line-item table, a right-aligned totals stack, an "AMOUNT DUE NOW"
 * callout on the two invoices, terms or payment instructions, signature blocks
 * and the red footer strip.
 */
import {
  lineAmount,
  quotationTotals,
  validUntil,
  DOC_TITLES,
  type DocumentKind,
  type QuotationLine,
} from '@/lib/domain/quotation';

export interface DocLine extends QuotationLine {
  description: string;
  wireDia: string | null;
  steelGrade: string | null;
  unit: string;
}

export interface QuotationDocData {
  kind: DocumentKind;
  /** Document number, e.g. ZYS-Q2607-003 (blank until issued). */
  docNo: string;
  /** Issue date, dd/mm/yyyy. */
  issuedOn: string;
  /** ISO issue date — used to compute the validity window. */
  issuedOnIso: string;
  customerName: string;
  contact: string | null;
  projectSite: string | null;
  currency: string;
  validDays: number;
  depositPct: number;
  lines: DocLine[];
  /** Quotation number this invoice refers back to (invoices only). */
  refQuotationNo?: string | null;
  /** Deposit invoice number the balance invoice offsets. */
  refDepositNo?: string | null;
  pricingBasis?: string | null;
  /** Overrides the default terms (quotation only). */
  terms?: string[] | null;
  bankName?: string | null;
  accountName?: string | null;
  accountNo?: string | null;
}

const RED = '#e31e24';
const PINK = '#fbf2f2';
const MUTED = '#6b6b6b';
const INK = '#1a1a1a';

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function money(n: number): string {
  const sign = n < 0 ? '-' : '';
  return `${sign}$${Math.abs(n).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function qty(n: number | null): string {
  return n == null ? '' : Number(n).toLocaleString('en-US', { maximumFractionDigits: 3 });
}

/** Default terms & conditions from the quotation sheet. */
export function defaultTerms(validDays: number): string[] {
  return [
    'All prices are quoted in US Dollars (USD).',
    'Prices are ex-factory, Phnom Penh. Delivery and transport can be arranged and quoted separately.',
    `This quotation is valid for ${validDays} days from the date of issue. Prices are subject to change with steel market rates thereafter.`,
    'Mesh size, panel dimensions, and quantity to be confirmed at the time of order.',
    'Payment terms: to be agreed upon order confirmation.',
    'Production lead time will be confirmed upon receipt of official purchase order.',
  ];
}

/** Payment instructions for the deposit / balance invoices. */
function paymentInstructions(d: QuotationDocData): string[] {
  const t = quotationTotals(d.lines, d.depositPct);
  const bank = d.bankName ?? '____________________';
  const account = d.accountName ?? '____________________';
  const accountNo = d.accountNo ?? '____________________';
  const first =
    d.kind === 'deposit'
      ? `This invoice covers the ${t.depositPercent}% deposit of the order value. The balance is due before delivery.`
      : `This invoice covers the remaining ${t.balancePercent}% balance of the order value, due prior to delivery / collection of the goods.`;
  const second =
    d.kind === 'deposit'
      ? 'Production will commence upon receipt of the deposit payment.'
      : 'Goods will be released for delivery upon receipt of this balance payment in full.';
  return [
    first,
    second,
    `Please quote Invoice No. ${d.docNo || '—'} when making payment.`,
    `Bank: ${bank}   Account Name: ${account}`,
    `Account No.: ${accountNo}   SWIFT / Branch: ____________________`,
  ];
}

/** Title-bar text, e.g. "DEPOSIT INVOICE (30%) · 30% 订金发票". */
export function documentTitle(kind: DocumentKind, depositPct: number): string {
  const t = quotationTotals([], depositPct);
  const { en, zh } = DOC_TITLES[kind];
  if (kind === 'quotation') return `${en} · ${zh}`;
  const pct = kind === 'deposit' ? t.depositPercent : t.balancePercent;
  return `${en} (${pct}%) · ${pct}% ${zh}`;
}

/** Build the print-ready HTML document. */
export function buildQuotationDocHtml(d: QuotationDocData): string {
  const t = quotationTotals(d.lines, d.depositPct);
  const isQuotation = d.kind === 'quotation';
  const toLabel = isQuotation ? 'QUOTATION TO:' : 'INVOICE TO:';

  // --- Meta (right-hand column) ---------------------------------------------
  const meta: Array<[string, string]> = [
    [isQuotation ? 'Quotation No.:' : 'Invoice No.:', d.docNo || '— not yet issued —'],
    ['Date:', d.issuedOn],
  ];
  if (isQuotation) {
    meta.push(['Valid Until:', `${validUntil(d.issuedOnIso, d.validDays)} (${d.validDays} days)`]);
  } else if (d.refQuotationNo) {
    meta.push(['Ref. Quotation:', d.refQuotationNo]);
  }
  meta.push(['Currency:', d.currency === 'USD' ? 'US Dollar (USD)' : d.currency]);

  const metaHtml = meta
    .map(([l, v]) => `<tr><td class="ml">${esc(l)}</td><td class="mv">${esc(v)}</td></tr>`)
    .join('');

  // --- Line items ------------------------------------------------------------
  // The quotation shows Steel Grade; the invoices show Amount instead.
  const head = isQuotation
    ? ['No.', 'Product Description', 'Wire Dia.', 'Steel Grade', 'Unit', 'Unit Price', 'Quantity']
    : ['No.', 'Product Description', 'Wire Dia.', 'Unit Price', 'Qty', 'Amount (USD)'];

  const body =
    d.lines.length === 0
      ? `<tr><td class="empty" colspan="${head.length}">No line items 暂无明细</td></tr>`
      : d.lines
          .map((l, i) => {
            const cells = isQuotation
              ? [
                  String(i + 1),
                  esc(l.description),
                  esc(l.wireDia ?? ''),
                  esc(l.steelGrade ?? ''),
                  esc(l.unit),
                  money(l.unitPrice ?? 0),
                  qty(l.quantity),
                ]
              : [
                  String(i + 1),
                  esc(l.description),
                  esc(l.wireDia ?? ''),
                  money(l.unitPrice ?? 0),
                  qty(l.quantity),
                  money(lineAmount(l)),
                ];
            const align = isQuotation
              ? ['c', 'l', 'l', 'l', 'c', 'r', 'r']
              : ['c', 'l', 'l', 'r', 'r', 'r'];
            return `<tr>${cells.map((c, n) => `<td class="${align[n]}">${c}</td>`).join('')}</tr>`;
          })
          .join('');

  const theadHtml = head
    .map((h, n) => {
      const align = isQuotation
        ? ['c', 'l', 'l', 'l', 'c', 'r', 'r']
        : ['c', 'l', 'l', 'r', 'r', 'r'];
      return `<th class="${align[n]}">${esc(h)}</th>`;
    })
    .join('');

  // --- Totals ----------------------------------------------------------------
  let totalsHtml = '';
  let dueLabel = '';
  let dueValue = '';
  if (!isQuotation) {
    const rows: Array<[string, string, boolean]> = [
      ['Contract Subtotal:', money(t.subtotal), false],
    ];
    if (d.kind === 'deposit') {
      rows.push([`Deposit Due Now (${t.depositPercent}%):`, money(t.depositDue), true]);
      rows.push(['Balance Due Before Delivery:', money(t.balanceDue), false]);
      dueLabel = `AMOUNT DUE NOW (${t.depositPercent}% DEPOSIT):`;
      dueValue = money(t.depositDue);
    } else {
      const ref = d.refDepositNo ? ` (Inv ${d.refDepositNo})` : '';
      rows.push([`Less: ${t.depositPercent}% Deposit Paid${ref}:`, money(-t.depositDue), false]);
      rows.push([`BALANCE DUE NOW (${t.balancePercent}%):`, money(t.balanceDue), true]);
      dueLabel = `AMOUNT DUE NOW (${t.balancePercent}% BALANCE):`;
      dueValue = money(t.balanceDue);
    }
    totalsHtml = rows
      .map(
        ([l, v, hi]) =>
          `<tr class="${hi ? 'hi' : ''}"><td class="tl">${esc(l)}</td><td class="tv">${esc(v)}</td></tr>`,
      )
      .join('');
  } else {
    totalsHtml = `<tr><td class="tl">Estimated Total:</td><td class="tv">${esc(money(t.subtotal))}</td></tr>`;
  }

  // --- Notes block -----------------------------------------------------------
  const notesTitle = isQuotation ? 'TERMS &amp; CONDITIONS' : 'PAYMENT INSTRUCTIONS';
  const notesList = isQuotation ? (d.terms ?? defaultTerms(d.validDays)) : paymentInstructions(d);
  const notesHtml = notesList.map((n) => `<li>${esc(n)}</li>`).join('');

  const pricingBasis =
    !isQuotation && d.pricingBasis
      ? `<div class="basis"><span class="basis-l">PRICING BASIS:</span> ${esc(d.pricingBasis)}</div>`
      : '';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>ZY Steel · ${esc(documentTitle(d.kind, d.depositPct))} ${esc(d.docNo)}</title>
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
  .basis { margin-top: 10px; font-size: 9.5px; color: ${MUTED}; }
  .basis-l { font-weight: 700; color: ${RED}; }
  .totals { margin-top: 12px; display: flex; justify-content: flex-end; }
  .totals table { border-collapse: collapse; font-size: 11px; }
  .totals .tl { text-align: right; font-weight: 700; padding: 4px 12px; white-space: nowrap; }
  .totals .tv { text-align: right; font-weight: 700; padding: 4px 12px; border: 1px solid #bfbfbf; min-width: 120px; }
  .totals tr.hi .tl, .totals tr.hi .tv { background: ${PINK}; color: ${RED}; }
  .due { display: flex; justify-content: space-between; align-items: baseline;
         margin-top: 18px; font-weight: 700; color: ${RED}; font-size: 13px; max-width: 460px; }
  .notes { margin-top: 20px; }
  .notes h4 { margin: 0 0 6px; font-size: 10.5px; color: ${RED}; letter-spacing: .3px; }
  .notes ol { margin: 0; padding-left: 18px; font-size: 9.5px; }
  .notes li { margin-bottom: 3px; }
  .sign { display: flex; justify-content: space-between; gap: 40px; margin-top: 42px; }
  .sign div { flex: 1; }
  .sign .role { font-size: 10.5px; font-weight: 700; margin-bottom: 34px; }
  .sign .rule { border-top: 1px solid ${INK}; width: 210px; }
  .sign .who { font-size: 9px; color: ${MUTED}; margin-top: 4px; }
  .footer {
    background: ${RED}; color: #fff; font-weight: 700; text-align: center;
    padding: 7px; margin-top: 26px; font-size: 9.5px;
  }
  .toolbar {
    position: fixed; top: 14px; right: 14px; z-index: 100;
    display: flex; align-items: center; gap: 10px;
    background: #fff; border: 1px solid #d8d8d8; border-radius: 8px;
    padding: 8px 12px; box-shadow: 0 2px 10px rgba(0,0,0,.15);
    font-family: Arial, sans-serif;
  }
  .toolbar button {
    background: ${RED}; color: #fff; border: none; border-radius: 6px;
    padding: 7px 14px; font-size: 12px; font-weight: 700; cursor: pointer;
  }
  .toolbar button:hover { opacity: .9; }
  .toolbar .hint { font-size: 10px; color: ${MUTED}; }
  @page { size: A4 portrait; margin: 12mm; }
  @media print { .no-print { display: none !important; } }
</style>
</head>
<body>
  <div class="toolbar no-print">
    <button type="button" onclick="window.print()">Print / Save as PDF</button>
    <span class="hint">Reviewing only — nothing has been printed yet.</span>
  </div>
  <div class="brand">ZY STEEL</div>
  <div class="brand-zh">中粤铁网</div>
  <div class="sub">Steel Mesh &amp; Wire Drawing Manufacturer</div>
  <div class="sub">Phnom Penh, Kingdom of Cambodia</div>

  <div class="bar">${esc(documentTitle(d.kind, d.depositPct))}</div>

  <div class="head">
    <div>
      <div class="to-l">${esc(toLabel)}</div>
      <div class="to-v">${esc(d.customerName)}</div>
      <div class="to-line">Contact / Tel: ${esc(d.contact ?? '____________________')}</div>
      <div class="to-line">Project / Site: ${esc(d.projectSite ?? '____________________')}</div>
    </div>
    <table class="meta">${metaHtml}</table>
  </div>

  <table class="items">
    <thead><tr>${theadHtml}</tr></thead>
    <tbody>${body}</tbody>
  </table>

  ${pricingBasis}

  <div class="totals"><table>${totalsHtml}</table></div>

  ${dueLabel ? `<div class="due"><span>${esc(dueLabel)}</span><span>${esc(dueValue)}</span></div>` : ''}

  <div class="notes">
    <h4>${notesTitle}</h4>
    <ol>${notesHtml}</ol>
  </div>

  <div class="sign">
    <div>
      <div class="role">Prepared &amp; Issued By</div>
      <div class="rule"></div>
      <div class="who">ZY Steel (中粤铁网) · Sales Department</div>
    </div>
    <div>
      <div class="role">Accepted By (Customer)</div>
      <div class="rule"></div>
      <div class="who">${esc(d.customerName)} &nbsp;&nbsp; Signature &amp; Date</div>
    </div>
  </div>

  <div class="footer">ZY STEEL 中粤铁网 · Phnom Penh, Cambodia · Thank you for your business</div>
</body>
</html>`;
}
