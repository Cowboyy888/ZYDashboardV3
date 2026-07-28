import { CalendarCheck, Boxes, AlertTriangle } from 'lucide-react';
import { getLocale } from '@/lib/i18n/locale';
import { translator } from '@/lib/i18n';
import { businessDate, formatDDMMYYYY } from '@/lib/domain/datetime';
import {
  summarizeShift,
  attendanceRate,
  STATUS_LABELS,
  type AttendanceRecord,
} from '@/lib/domain/attendance';
import { buildInventoryRows, totalsByFamilyUnit } from '@/lib/domain/inventory-view';
import {
  getEmployees,
  getAttendanceForDate,
  getAttendanceRange,
  getSkus,
  getFamilies,
  getLocations,
  getBalances,
  getProductionCountForDate,
} from '@/lib/db/queries';
import { PageHeader } from '@/components/page-header';
import { StatCard } from '@/components/stat-card';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const locale = await getLocale();
  const t = translator(locale);
  const today = businessDate();
  const monthStart = today.slice(0, 8) + '01';

  const [
    employees,
    todaysAttendance,
    monthAttendance,
    skus,
    families,
    locations,
    balances,
    productionToday,
  ] = await Promise.all([
    getEmployees(),
    getAttendanceForDate(today),
    getAttendanceRange(monthStart, today),
    getSkus(),
    getFamilies(),
    getLocations(),
    getBalances(),
    getProductionCountForDate(today),
  ]);

  const activeIds = employees.map((e) => e.id);
  const records: AttendanceRecord[] = todaysAttendance.map((a) => ({
    employeeId: a.employee_id,
    businessDate: a.business_date,
    shift: a.shift,
    status: a.status,
  }));
  const morning = summarizeShift(activeIds, records, today, 'morning');
  const afternoon = summarizeShift(activeIds, records, today, 'afternoon');
  const mtdRate = attendanceRate(
    monthAttendance.map((a) => ({
      employeeId: a.employee_id,
      businessDate: a.business_date,
      shift: a.shift,
      status: a.status,
    })),
  );

  const rows = buildInventoryRows(skus, families, locations, balances, locale);
  const lowStock = rows.filter((r) => r.isLow);
  const nameOf = new Map(
    employees.map((e) => [
      e.id,
      e.display_name || e.name_english || e.name_chinese || e.name_khmer || e.id,
    ]),
  );
  const sub = (s: typeof morning) =>
    `${STATUS_LABELS.late[locale]} ${s.late} · ${STATUS_LABELS.leave[locale]} ${s.leave} · ${STATUS_LABELS.absent[locale]} ${s.absent} · ${STATUS_LABELS.unmarked[locale]} ${s.unmarked}`;

  const familyTotals = totalsByFamilyUnit(rows);

  return (
    <div>
      <PageHeader
        title={t('dash.title')}
        description={`${formatDDMMYYYY(today)} · Asia/Phnom_Penh`}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label={t('dash.morningAtt')}
          value={`${morning.present}/${morning.totalActive}`}
          sub={sub(morning)}
          tone={morning.unmarked > 0 ? 'warning' : 'success'}
        />
        <StatCard
          label={t('dash.afternoonAtt')}
          value={`${afternoon.present}/${afternoon.totalActive}`}
          sub={sub(afternoon)}
          tone={afternoon.unmarked > 0 ? 'warning' : 'success'}
        />
        <StatCard
          label={t('dash.mtdRate')}
          value={`${(mtdRate * 100).toFixed(0)}%`}
          sub={`${formatDDMMYYYY(monthStart)} – ${formatDDMMYYYY(today)}`}
          tone="primary"
        />
        <StatCard
          label={t('dash.productionToday')}
          value={productionToday.toLocaleString()}
          sub="张 · 钢筋网"
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Boxes className="h-4 w-4 text-primary" /> {t('dash.inventoryTotals')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {familyTotals.length === 0 && <p className="text-sm text-muted-foreground">—</p>}
            {familyTotals.map((f) => (
              <div
                key={`${f.familyId}-${f.unit}`}
                className="flex items-center justify-between text-sm"
              >
                <span>{f.familyName}</span>
                <span className="font-semibold tabular-nums">
                  {f.total.toLocaleString()} {f.unit}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4 text-warning" /> {t('dash.lowStock')}
              {lowStock.length > 0 && <Badge variant="warning">{lowStock.length}</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {lowStock.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('dash.allGood')} ✅</p>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {lowStock.slice(0, 8).map((r) => (
                  <li key={r.skuId} className="flex items-center justify-between">
                    <span className="truncate pr-2">{r.label}</span>
                    <span className="shrink-0 font-semibold tabular-nums text-warning">
                      {r.total} / {r.minimumLevel} {r.unit}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarCheck className="h-4 w-4 text-primary" /> {t('dash.attExceptions')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {morning.exceptions.length === 0 && afternoon.exceptions.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('dash.none')} ✅</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {(['morning', 'afternoon'] as const).map((shift) => {
                const summary = shift === 'morning' ? morning : afternoon;
                return (
                  <div key={shift}>
                    <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
                      {shift === 'morning' ? t('dash.morning') : t('dash.afternoon')}
                    </div>
                    {summary.exceptions.length === 0 ? (
                      <p className="text-sm text-muted-foreground">—</p>
                    ) : (
                      <ul className="space-y-1 text-sm">
                        {summary.exceptions.map((ex) => (
                          <li key={ex.employeeId} className="flex justify-between">
                            <span>{nameOf.get(ex.employeeId) ?? ex.employeeId}</span>
                            <Badge variant={ex.status === 'unmarked' ? 'outline' : 'secondary'}>
                              {STATUS_LABELS[ex.status][locale]}
                            </Badge>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <ComingSoonTile
          title={t('dash.salesToday')}
          pass={t('pass.third')}
          label={t('cs.comingSoon')}
        />
        <ComingSoonTile
          title={t('dash.openPOs')}
          pass={t('pass.second')}
          label={t('cs.comingSoon')}
        />
        <ComingSoonTile
          title={t('dash.pendingDeliveries')}
          pass={t('pass.third')}
          label={t('cs.comingSoon')}
        />
        <ComingSoonTile
          title={t('dash.payrollApprovals')}
          pass={t('pass.fourth')}
          label={t('cs.comingSoon')}
        />
      </div>

      <p className="mt-2 text-xs text-muted-foreground">{t('dash.placeholderNote')}</p>
    </div>
  );
}

function ComingSoonTile({ title, pass, label }: { title: string; pass: string; label: string }) {
  return (
    <Card className="border-dashed">
      <CardContent className="p-4">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {title}
        </div>
        <div className="mt-2 text-sm text-muted-foreground">
          {label} · {pass}
        </div>
      </CardContent>
    </Card>
  );
}
