import { requirePermission } from '@/lib/auth';
import {
  getInquiries,
  getInquiryStatuses,
  getInquiryCustomerTypes,
  getEmployees,
  getFamilies,
} from '@/lib/db/queries';
import { businessDate, formatDDMMYYYY } from '@/lib/domain/datetime';
import { summarizeInquiries, type StatusCategory } from '@/lib/domain/sales-inquiry';
import {
  toReportRow,
  type InquiryReportResolvers,
  type InquiryReportData,
} from '@/lib/reports/inquiry-report-html';
import { buildInquiryReportXlsx } from '@/lib/reports/inquiry-report-xlsx';
import { xlsxResponse } from '@/lib/reports/xlsx';

export const dynamic = 'force-dynamic';

export async function GET() {
  await requirePermission('inquiries:view');

  const [inquiries, statuses, customerTypes, employees, families] = await Promise.all([
    getInquiries(),
    getInquiryStatuses(true),
    getInquiryCustomerTypes(true),
    getEmployees(true),
    getFamilies(true),
  ]);

  const empName = new Map(
    employees.map((e) => [
      e.id,
      e.display_name || e.name_english || e.name_chinese || e.employee_code,
    ]),
  );
  const typeName = new Map(customerTypes.map((c) => [c.id, c.name]));
  const familyName = new Map(families.map((f) => [f.id, f.name]));
  const statusById = new Map(statuses.map((s) => [s.id, s]));

  const resolvers: InquiryReportResolvers = {
    salespersonName: (id) => (id && empName.get(id)) || '',
    typeName: (id) => (id && typeName.get(id)) || '',
    familyName: (id) => (id && familyName.get(id)) || '',
    status: (id) => {
      const s = id ? statusById.get(id) : undefined;
      return s ? { name: s.name, category: s.category } : null;
    },
  };

  const summary = summarizeInquiries(
    inquiries.map((i) => ({
      factoryCost: i.factory_cost,
      quotedPrice: i.quoted_price,
      targetPrice: i.target_price,
      finalPrice: i.final_price,
      areaPerSheet: i.area_per_sheet,
      quantity: i.quantity,
      statusCategory: (statusById.get(i.status_id ?? '')?.category ??
        null) as StatusCategory | null,
      familyId: i.family_id,
      salespersonId: i.salesperson_id,
    })),
  );

  const data: InquiryReportData = {
    generatedOn: formatDDMMYYYY(businessDate()),
    summary,
    rows: inquiries.map((i) => toReportRow(i, resolvers)),
  };

  const buffer = await buildInquiryReportXlsx(data);
  return xlsxResponse(buffer, `inquiry-report-${businessDate()}.xlsx`);
}
