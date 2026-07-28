import type { CSSProperties } from 'react';
import { CalendarCheck, Boxes, AlertTriangle } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { hasPermission } from '@/lib/domain/rbac';
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
  getPurchaseOrders,
  getSalesOrders,
  getPayrollRuns,
} from '@/lib/db/queries';
import { PageHeader } from '@/components/page-header';
import { StatCard } from '@/components/stat-card';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ProductionQuickEntry } from './production-quick-entry';

export const dynamic = 'force-dynamic';

/**
 * One-shot entrance animation (opacity + transform only, GPU-composited, no
 * JS) for a fixed, small number of dashboard cards. `motion-safe:` keeps it
 * off entirely for prefers-reduced-motion. Never applied to list rows whose
 * count scales with data — only to the bounded set of section/stat cards.
 *
 * The per-card delay is a runtime value, so it must be an inline style, not a
 * Tailwind utility class — Tailwind's compiler only generates CSS for class
 * names it can find as a complete, static string in the source; a
 * template-interpolated class like `delay-[${ms}ms]` never appears literally
 * in this file, so it would silently produce no CSS (verified: the animation
 * classes below all worked, but a first attempt using `delay-[${ms}ms]` did
 * not — every card animated with zero delay, no stagger).
 */
const ENTER_CLASS =
  'motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:fill-mode-both motion-safe:duration-500';

function enterStyle(delayMs = 0): CSSProperties {
  return { animationDelay: `${delayMs}ms` };
}

export default async function DashboardPage() {
  const user = await requireUser();
  const locale = await getLocale();
  const t = translator(locale);
  const today = businessDate();
  const monthStart = today.slice(0, 8) + '01';

  const canSales = hasPermission(user.role, 'sales:view');
  const canPurchasing = hasPermission(user.role, 'purchasing:view');
  const canPayroll = hasPermission(user.role, 'payroll:view');
  const canLogProduction = hasPermission(user.role, 'stock:production');

  const [
    employees,
    todaysAttendance,
    monthAttendance,
    skus,
    families,
    locations,
    balances,
    productionToday,
    purchaseOrders,
    salesOrders,
    payrollRuns,
  ] = await Promise.all([
    getEmployees(),
    getAttendanceForDate(today),
    getAttendanceRange(monthStart, today),
    getSkus(),
    getFamilies(),
    getLocations(),
    getBalances(),
    getProductionCountForDate(today),
    canPurchasing ? getPurchaseOrders() : Promise.resolve([]),
    canSales ? getSalesOrders() : Promise.resolve([]),
    canPayroll ? getPayrollRuns() : Promise.resolve([]),
  ]);

  const openPoCount = purchaseOrders.filter(
    (po) => po.status === 'ordered' || po.status === 'partially_received',
  ).length;
  const salesTodayCount = salesOrders.filter(
    (so) => so.order_date === today && so.status !== 'cancelled',
  ).length;
  const pendingDeliveryCount = salesOrders.filter(
    (so) => so.status === 'confirmed' || so.status === 'partially_delivered',
  ).length;
  const payrollApprovalCount = payrollRuns.filter((r) => r.status === 'draft').length;

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
          className={ENTER_CLASS}
          style={enterStyle(0)}
          label={t('dash.morningAtt')}
          value={`${morning.present}/${morning.totalActive}`}
          sub={sub(morning)}
          tone={morning.unmarked > 0 ? 'warning' : 'success'}
        />
        <StatCard
          className={ENTER_CLASS}
          style={enterStyle(60)}
          label={t('dash.afternoonAtt')}
          value={`${afternoon.present}/${afternoon.totalActive}`}
          sub={sub(afternoon)}
          tone={afternoon.unmarked > 0 ? 'warning' : 'success'}
        />
        <StatCard
          className={ENTER_CLASS}
          style={enterStyle(120)}
          label={t('dash.mtdRate')}
          value={`${(mtdRate * 100).toFixed(0)}%`}
          sub={`${formatDDMMYYYY(monthStart)} – ${formatDDMMYYYY(today)}`}
          tone="primary"
        />
        <StatCard
          className={ENTER_CLASS}
          style={enterStyle(180)}
          label={t('dash.productionToday')}
          value={productionToday.toLocaleString()}
          sub="张 · 钢筋网"
        />
      </div>

      {canLogProduction && (
        <div className={`mt-4 ${ENTER_CLASS}`} style={enterStyle(220)}>
          <ProductionQuickEntry
            skus={rows.map((r) => ({ skuId: r.skuId, label: r.label }))}
            locations={locations.map((l) => ({ id: l.id, name: l.name }))}
            today={today}
          />
        </div>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className={`lg:col-span-1 ${ENTER_CLASS}`} style={enterStyle(260)}>
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

        <Card className={`lg:col-span-2 ${ENTER_CLASS}`} style={enterStyle(300)}>
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

      <Card className={`mt-4 ${ENTER_CLASS}`} style={enterStyle(340)}>
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

      {(canSales || canPurchasing || canPayroll) && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {canSales && (
            <StatCard
              className={ENTER_CLASS}
              style={enterStyle(380)}
              label={t('dash.salesToday')}
              value={String(salesTodayCount)}
              tone="primary"
            />
          )}
          {canPurchasing && (
            <StatCard
              className={ENTER_CLASS}
              style={enterStyle(420)}
              label={t('dash.openPOs')}
              value={String(openPoCount)}
              tone={openPoCount > 0 ? 'warning' : 'success'}
            />
          )}
          {canSales && (
            <StatCard
              className={ENTER_CLASS}
              style={enterStyle(460)}
              label={t('dash.pendingDeliveries')}
              value={String(pendingDeliveryCount)}
              tone={pendingDeliveryCount > 0 ? 'warning' : 'success'}
            />
          )}
          {canPayroll && (
            <StatCard
              className={ENTER_CLASS}
              style={enterStyle(500)}
              label={t('dash.payrollApprovals')}
              value={String(payrollApprovalCount)}
              tone={payrollApprovalCount > 0 ? 'warning' : 'success'}
            />
          )}
        </div>
      )}
    </div>
  );
}
