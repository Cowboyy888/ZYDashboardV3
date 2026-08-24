import { requirePermission } from '@/lib/auth';
import { getLocale } from '@/lib/i18n/locale';
import { businessDate, formatDDMMYYYY } from '@/lib/domain/datetime';
import { getInventoryReportRows } from '@/lib/reports/inventory-report-data';
import {
  buildInventoryReportHtml,
  type InventoryReportData,
} from '@/lib/reports/inventory-report-html';
import { renderHtmlToPdf, pdfResponse } from '@/lib/reports/pdf';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  await requirePermission('inventory:view');
  const locale = await getLocale();

  const rows = await getInventoryReportRows(locale);
  const data: InventoryReportData = { generatedOn: formatDDMMYYYY(businessDate()), rows };

  const html = buildInventoryReportHtml(data);
  const buffer = await renderHtmlToPdf(html, { baseUrl: new URL(request.url).origin });
  return pdfResponse(buffer, `inventory-report-${businessDate()}.pdf`);
}
