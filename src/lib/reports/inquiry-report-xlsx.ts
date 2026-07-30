import 'server-only';
import ExcelJS from 'exceljs';
import { INQUIRY_REPORT_COLUMNS, type InquiryReportData } from './inquiry-report-html';

// Palette lifted from the ZY Steels price-list template (ARGB).
const RED = 'FFE31E24';
const HEADER_RED = 'FFB3141A';
const GREY = 'FFEDEDED';
const BANNER = 'FFFBF2F2';
const MUTED = 'FF6B6B6B';
const INK = 'FF1A1A1A';
const WHITE = 'FFFFFFFF';
const USD_FMT = '$#,##0.00';

const N = INQUIRY_REPORT_COLUMNS.length;

/**
 * Build a branded .xlsx buffer for the Customer Price Inquiry report — same
 * letterhead / red section bar / bordered table / footer as the print-to-PDF
 * view, so the two downloads look like one report.
 */
export async function buildInquiryReportXlsx(data: InquiryReportData): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Zysteel Operations';
  wb.created = new Date();
  const sheet = wb.addWorksheet('Inquiry Report', {
    views: [{ state: 'frozen', ySplit: 8 }],
  });
  INQUIRY_REPORT_COLUMNS.forEach((c, i) => (sheet.getColumn(i + 1).width = c.width));

  const mergeRow = (rowIdx: number) => sheet.mergeCells(rowIdx, 1, rowIdx, N);

  // Row 1 — brand title.
  mergeRow(1);
  const title = sheet.getCell('A1');
  title.value = 'ZY Steels  中粤铁网';
  title.font = { name: 'Arial', size: 20, bold: true, color: { argb: INK } };
  title.alignment = { vertical: 'middle' };
  sheet.getRow(1).height = 28;

  // Row 2 — subtitle.
  mergeRow(2);
  const sub = sheet.getCell('A2');
  sub.value = 'Steel Mesh & Wire Drawing Manufacturer  ·  Phnom Penh, Cambodia';
  sub.font = { name: 'Arial', size: 10, color: { argb: MUTED } };

  // Row 3 — confidential banner.
  mergeRow(3);
  const conf = sheet.getCell('A3');
  conf.value =
    'CONFIDENTIAL · 机密 — Internal sales report. Do not distribute outside ZY Steels. 内部销售报告，请勿外传。';
  conf.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BANNER } };
  conf.font = { name: 'Arial', size: 9, color: { argb: INK } };
  conf.alignment = { vertical: 'middle', wrapText: true };
  conf.border = { left: { style: 'thick', color: { argb: RED } } };
  sheet.getRow(3).height = 22;

  // Row 4 — red section bar.
  mergeRow(4);
  const bar = sheet.getCell('A4');
  bar.value = 'CUSTOMER PRICE INQUIRY REPORT · 客户询价报告';
  bar.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: RED } };
  bar.font = { name: 'Arial', size: 13, bold: true, color: { argb: WHITE } };
  bar.alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.getRow(4).height = 24;

  // Row 5 — meta.
  mergeRow(5);
  const meta = sheet.getCell('A5');
  meta.value = `Generated 生成日期: ${data.generatedOn}   ·   Prices per square metre ($/m²) 单价按平方米`;
  meta.font = { name: 'Arial', size: 9, color: { argb: MUTED } };

  // Row 6 — KPI summary (single merged line).
  const s = data.summary;
  mergeRow(6);
  const kpi = sheet.getCell('A6');
  kpi.value =
    `Inquiries 询价数: ${s.totalInquiries}    ·    ` +
    `Quotation value 报价总额: $${s.totalQuotationValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}    ·    ` +
    `Won 成交: ${s.wonOrders}    ·    Lost 流失: ${s.lostOrders}    ·    ` +
    `Conversion 成交率: ${(s.conversionRate * 100).toFixed(0)}%    ·    ` +
    `Won profit 成交利润: $${s.wonProfit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}    ·    ` +
    `Pending 待跟进: ${s.pendingFollowups}`;
  kpi.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GREY } };
  kpi.font = { name: 'Arial', size: 9, bold: true, color: { argb: INK } };
  kpi.alignment = { vertical: 'middle', wrapText: true };
  sheet.getRow(6).height = 20;

  // Row 7 — spacer.
  sheet.getRow(7).height = 6;

  // Row 8 — table header.
  const HEADER_ROW = 8;
  const header = sheet.getRow(HEADER_ROW);
  INQUIRY_REPORT_COLUMNS.forEach((c, i) => {
    const cell = header.getCell(i + 1);
    cell.value = c.header;
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_RED } };
    cell.font = { name: 'Arial', size: 9.5, bold: true, color: { argb: WHITE } };
    cell.alignment = {
      horizontal: c.kind === 'text' ? 'left' : 'right',
      vertical: 'middle',
      wrapText: true,
    };
    cell.border = thin();
  });
  header.height = 28;

  // Data rows.
  data.rows.forEach((row, idx) => {
    const r = sheet.getRow(HEADER_ROW + 1 + idx);
    INQUIRY_REPORT_COLUMNS.forEach((c, i) => {
      const cell = r.getCell(i + 1);
      const v = row[c.key];
      if (c.kind === 'text') {
        cell.value = (v as string) ?? '';
        cell.alignment = { horizontal: 'left', vertical: 'middle' };
      } else {
        cell.value = v == null || v === '' ? null : Number(v);
        cell.numFmt = c.kind === 'usd' ? USD_FMT : '#,##0.###';
        cell.alignment = { horizontal: 'right', vertical: 'middle' };
      }
      cell.font = { name: 'Arial', size: 9, color: { argb: INK } };
      cell.border = thin();
    });
  });

  // Footer bar.
  const footerRow = HEADER_ROW + 1 + data.rows.length;
  sheet.mergeCells(footerRow, 1, footerRow, N);
  const footer = sheet.getCell(footerRow, 1);
  footer.value = `ZY Steels 中粤铁网 · Confidential 机密 · Generated ${data.generatedOn}`;
  footer.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: RED } };
  footer.font = { name: 'Arial', size: 9, bold: true, color: { argb: WHITE } };
  footer.alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.getRow(footerRow).height = 18;

  const arrayBuffer = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

function thin(): Partial<ExcelJS.Borders> {
  const c = { argb: 'FFCFCFCF' };
  return {
    top: { style: 'thin', color: c },
    bottom: { style: 'thin', color: c },
    left: { style: 'thin', color: c },
    right: { style: 'thin', color: c },
  };
}
