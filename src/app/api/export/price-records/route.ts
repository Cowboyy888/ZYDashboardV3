import { requirePermission } from '@/lib/auth';
import {
  getAllPriceRecords,
  getSkus,
  getFamilies,
  getCustomers,
  getPriceTypes,
  getProfiles,
} from '@/lib/db/queries';
import { businessDate, formatDDMMYYYY } from '@/lib/domain/datetime';
import { buildSkuLabel } from '@/lib/domain/products';
import {
  toReportRow,
  type PriceRecordReportResolvers,
  type PriceRecordReportData,
} from '@/lib/reports/price-record-report-html';
import { buildPriceRecordReportXlsx } from '@/lib/reports/price-record-report-xlsx';
import { xlsxResponse } from '@/lib/reports/xlsx';
import { priceRecordFiltersFromSearchParams } from '@/lib/reports/price-record-report-filters';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  await requirePermission('price_records:view');

  const { filters, search } = priceRecordFiltersFromSearchParams(new URL(request.url).searchParams);
  const [records, skus, families, customers, priceTypes, profiles] = await Promise.all([
    getAllPriceRecords({ filters, search }),
    getSkus(true),
    getFamilies(true),
    getCustomers(true),
    getPriceTypes(true),
    getProfiles(),
  ]);

  const familyById = new Map(families.map((f) => [f.id, f.name]));
  const skuById = new Map(skus.map((s) => [s.id, s]));
  const customerName = new Map(customers.map((c) => [c.id, c.name]));
  const priceTypeName = new Map(priceTypes.map((pt) => [pt.id, pt.name]));
  const profileName = new Map(profiles.map((p) => [p.id, p.full_name || p.email]));

  const resolvers: PriceRecordReportResolvers = {
    skuLabel: (skuId) => {
      const s = skuById.get(skuId);
      if (!s) return '—';
      return buildSkuLabel({
        familyName: familyById.get(s.family_id) ?? '—',
        diameter: s.diameter,
        size: s.size,
        hole: s.hole,
        rodCount: s.rod_count,
        extra: s.extra,
        condition: s.condition,
        unit: s.unit,
      });
    },
    skuFamilyName: (skuId) => {
      const s = skuById.get(skuId);
      return (s && familyById.get(s.family_id)) || '—';
    },
    customerName: (id) => (id && customerName.get(id)) || '',
    priceTypeName: (id) => priceTypeName.get(id) || '',
    createdByName: (id) => (id && profileName.get(id)) || '',
  };

  const data: PriceRecordReportData = {
    generatedOn: formatDDMMYYYY(businessDate()),
    rows: records.map((r) => toReportRow(r, resolvers)),
  };

  const buffer = await buildPriceRecordReportXlsx(data);
  return xlsxResponse(buffer, `price-record-report-${businessDate()}.xlsx`);
}
