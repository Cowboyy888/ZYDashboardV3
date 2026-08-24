import { requirePermission } from '@/lib/auth';
import { getLocale } from '@/lib/i18n/locale';
import { businessDate, formatDDMMYYYY } from '@/lib/domain/datetime';
import { getInventoryReportRows } from '@/lib/reports/inventory-report-data';
import { type InventoryReportData } from '@/lib/reports/inventory-report-html';
import { buildInventoryReportXlsx } from '@/lib/reports/inventory-report-xlsx';
import { xlsxResponse } from '@/lib/reports/xlsx';

export const dynamic = 'force-dynamic';

export async function GET() {
  await requirePermission('inventory:view');
  const locale = await getLocale();

  const rows = await getInventoryReportRows(locale);
  const data: InventoryReportData = { generatedOn: formatDDMMYYYY(businessDate()), rows };

  const buffer = await buildInventoryReportXlsx(data);
  return xlsxResponse(buffer, `inventory-report-${businessDate()}.xlsx`);
}
