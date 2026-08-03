'use client';
import { useActionState, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Calculator, Download, Loader2, Plus, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ActionForm } from '@/components/forms/action-form';
import { SubmitButton } from '@/components/forms/submit-button';
import { useT } from '@/components/i18n-provider';
import {
  createOvertimeEntry,
  deleteOvertimeEntry,
  saveOvertimeSettings,
} from '@/lib/actions/overtime';
import {
  tier1Amount,
  tier2Amount,
  overtimeTotal,
  totalHours,
  splitTimeRange,
  summarizeOvertime,
  DEFAULT_TIER1_RATE,
  DEFAULT_TIER2_RATE,
  DEFAULT_TIER1_LABEL,
  DEFAULT_TIER2_LABEL,
} from '@/lib/domain/overtime';
import { formatDDMMYYYY } from '@/lib/domain/datetime';
import type { ActionState } from '@/lib/actions/types';
import type { OvertimeEntryRow, OvertimeSettingsRow } from '@/lib/db/types';

type Opt = { id: string; name: string };

const selectCls =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

const usd = (n: number) => `$${n.toFixed(2)}`;
const hrs = (n: number) => `${Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 })}h`;
const num = (s: string): number => {
  const v = parseFloat(s);
  return Number.isFinite(v) && v > 0 ? v : 0;
};

export function OvertimeDashboard({
  entries,
  settings,
  employees,
  from,
  to,
  canManage,
  canEditRates,
}: {
  entries: OvertimeEntryRow[];
  settings: OvertimeSettingsRow | null;
  employees: Opt[];
  from: string;
  to: string;
  canManage: boolean;
  canEditRates: boolean;
}) {
  const { t } = useT();
  const router = useRouter();

  const tier1Rate = settings?.tier1_rate ?? DEFAULT_TIER1_RATE;
  const tier2Rate = settings?.tier2_rate ?? DEFAULT_TIER2_RATE;
  const tier1Label = settings?.tier1_label ?? DEFAULT_TIER1_LABEL;
  const tier2Label = settings?.tier2_label ?? DEFAULT_TIER2_LABEL;

  const empName = useMemo(() => new Map(employees.map((e) => [e.id, e.name])), [employees]);

  const summary = useMemo(
    () =>
      summarizeOvertime(
        entries.map((e) => ({
          businessDate: e.business_date,
          employeeId: e.employee_id,
          description: e.description,
          tier1Hours: Number(e.tier1_hours),
          tier2Hours: Number(e.tier2_hours),
          tier1Amount: Number(e.tier1_amount),
          tier2Amount: Number(e.tier2_amount),
          totalAmount: Number(e.total_amount),
        })),
      ),
    [entries],
  );

  const [showAdd, setShowAdd] = useState(false);
  const [showRates, setShowRates] = useState(false);

  // Date-range filter (defaults to the current month, like the monthly sheet).
  const [rangeFrom, setRangeFrom] = useState(from);
  const [rangeTo, setRangeTo] = useState(to);
  function applyRange() {
    router.push(`/attendance/overtime?from=${rangeFrom}&to=${rangeTo}`);
  }

  const kpis: Array<{ label: string; value: string; hint?: string }> = [
    { label: t('ot.kpiEntries'), value: String(summary.entries) },
    { label: t('ot.kpiPeople'), value: String(summary.people) },
    { label: t('ot.kpiHours'), value: hrs(summary.totalHours) },
    {
      label: `${t('ot.kpiTier1')} · ${tier1Label}`,
      value: usd(summary.tier1Amount),
      hint: `${hrs(summary.tier1Hours)} × ${usd(tier1Rate)}`,
    },
    {
      label: `${t('ot.kpiTier2')} · ${tier2Label}`,
      value: usd(summary.tier2Amount),
      hint: `${hrs(summary.tier2Hours)} × ${usd(tier2Rate)}`,
    },
    { label: t('ot.kpiTotal'), value: usd(summary.totalAmount) },
  ];

  return (
    <div className="space-y-4">
      {/* Formula reference — the sheet's rule, stated plainly. */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-x-4 gap-y-1 p-3 text-sm">
          <span className="flex items-center gap-1.5 font-medium">
            <Calculator className="h-4 w-4 text-primary" />
            {t('ot.formula')}
          </span>
          <span className="text-muted-foreground">
            {tier1Label} × {usd(tier1Rate)}/h + {tier2Label} × {usd(tier2Rate)}/h ={' '}
            {t('ot.totalAmount')}
          </span>
        </CardContent>
      </Card>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {kpis.map((k) => (
          <Card key={k.label}>
            <CardContent className="p-3">
              <div className="text-xs text-muted-foreground">{k.label}</div>
              <div className="text-lg font-semibold tabular-nums">{k.value}</div>
              {k.hint && <div className="text-[11px] text-muted-foreground">{k.hint}</div>}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Toolbar: range + actions */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1.5">
            <Label htmlFor="ot-from" className="text-xs">
              {t('ot.from')}
            </Label>
            <Input
              id="ot-from"
              type="date"
              value={rangeFrom}
              onChange={(e) => setRangeFrom(e.target.value)}
              className="h-9 w-40"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ot-to" className="text-xs">
              {t('ot.to')}
            </Label>
            <Input
              id="ot-to"
              type="date"
              value={rangeTo}
              onChange={(e) => setRangeTo(e.target.value)}
              className="h-9 w-40"
            />
          </div>
          <Button variant="outline" size="sm" onClick={applyRange}>
            {t('ot.apply')}
          </Button>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <a href={`/api/export/overtime?from=${rangeFrom}&to=${rangeTo}`}>
              <Download className="h-4 w-4" /> {t('ot.downloadExcel')}
            </a>
          </Button>
          {canEditRates && (
            <Button variant="outline" onClick={() => setShowRates((s) => !s)}>
              {showRates ? <X className="h-4 w-4" /> : null} {t('ot.rates')}
            </Button>
          )}
          {canManage && (
            <Button
              variant={showAdd ? 'secondary' : 'default'}
              onClick={() => setShowAdd((s) => !s)}
            >
              {showAdd ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              {showAdd ? t('common.close') : t('ot.add')}
            </Button>
          )}
        </div>
      </div>

      {/* Editable rates */}
      {canEditRates && showRates && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('ot.rates')}</CardTitle>
          </CardHeader>
          <CardContent>
            <ActionForm action={saveOvertimeSettings}>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-1.5">
                  <Label htmlFor="ot-t1l">{t('ot.tier1Label')}</Label>
                  <Input id="ot-t1l" name="tier1Label" defaultValue={tier1Label} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ot-t1r">{t('ot.tier1Rate')}</Label>
                  <Input
                    id="ot-t1r"
                    name="tier1Rate"
                    type="number"
                    step="0.01"
                    min="0"
                    defaultValue={tier1Rate}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ot-t2l">{t('ot.tier2Label')}</Label>
                  <Input id="ot-t2l" name="tier2Label" defaultValue={tier2Label} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ot-t2r">{t('ot.tier2Rate')}</Label>
                  <Input
                    id="ot-t2r"
                    name="tier2Rate"
                    type="number"
                    step="0.01"
                    min="0"
                    defaultValue={tier2Rate}
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">{t('ot.ratesNote')}</p>
              <SubmitButton>{t('common.save')}</SubmitButton>
            </ActionForm>
          </CardContent>
        </Card>
      )}

      {/* Add entry with live formula preview */}
      {canManage && showAdd && (
        <AddOvertimeForm
          employees={employees}
          tier1Rate={tier1Rate}
          tier2Rate={tier2Rate}
          tier1Label={tier1Label}
          tier2Label={tier2Label}
          defaultDate={to}
          onDone={() => setShowAdd(false)}
        />
      )}

      {/* Entries table — same columns as the 加班表 sheet */}
      <Card>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('ot.date')}</TableHead>
                <TableHead>{t('ot.employee')}</TableHead>
                <TableHead>{t('ot.task')}</TableHead>
                <TableHead>{t('ot.timeRange')}</TableHead>
                <TableHead className="text-right">{tier1Label}</TableHead>
                <TableHead className="text-right">{t('ot.amount')}</TableHead>
                <TableHead className="text-right">{tier2Label}</TableHead>
                <TableHead className="text-right">{t('ot.amount')}</TableHead>
                <TableHead className="text-right">{t('ot.totalAmount')}</TableHead>
                {canManage && <TableHead className="text-right">{t('common.actions')}</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="whitespace-nowrap text-sm">
                    {formatDDMMYYYY(e.business_date)}
                  </TableCell>
                  <TableCell className="font-medium">{empName.get(e.employee_id) ?? '—'}</TableCell>
                  <TableCell className="text-sm">{e.description || '—'}</TableCell>
                  <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                    {e.time_range || '—'}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {Number(e.tier1_hours) || '—'}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {usd(Number(e.tier1_amount))}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {Number(e.tier2_hours) || '—'}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {usd(Number(e.tier2_amount))}
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">
                    {usd(Number(e.total_amount))}
                  </TableCell>
                  {canManage && (
                    <TableCell className="text-right">
                      <ActionForm action={deleteOvertimeEntry} className="space-y-0">
                        <input type="hidden" name="id" value={e.id} />
                        <SubmitButton
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </SubmitButton>
                      </ActionForm>
                    </TableCell>
                  )}
                </TableRow>
              ))}
              {entries.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={canManage ? 10 : 9}
                    className="text-center text-muted-foreground"
                  >
                    {t('ot.none')}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
            {entries.length > 0 && (
              <tfoot>
                <TableRow className="bg-muted/50 font-semibold">
                  <TableCell colSpan={4}>{t('ot.grandTotal')}</TableCell>
                  <TableCell className="text-right tabular-nums">{summary.tier1Hours}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {usd(summary.tier1Amount)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{summary.tier2Hours}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {usd(summary.tier2Amount)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {usd(summary.totalAmount)}
                  </TableCell>
                  {canManage && <TableCell />}
                </TableRow>
              </tfoot>
            )}
          </Table>
        </CardContent>
      </Card>

      {/* Rollups */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('ot.byEmployee')}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('ot.employee')}</TableHead>
                  <TableHead className="text-right">{t('ot.hours')}</TableHead>
                  <TableHead className="text-right">{t('ot.totalAmount')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summary.byEmployee.map((r) => (
                  <TableRow key={r.key}>
                    <TableCell>{empName.get(r.key) ?? '—'}</TableCell>
                    <TableCell className="text-right tabular-nums">{hrs(r.hours)}</TableCell>
                    <TableCell className="text-right tabular-nums">{usd(r.amount)}</TableCell>
                  </TableRow>
                ))}
                {summary.byEmployee.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground">
                      {t('ot.none')}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('ot.byTask')}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('ot.task')}</TableHead>
                  <TableHead className="text-right">{t('ot.hours')}</TableHead>
                  <TableHead className="text-right">{t('ot.totalAmount')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summary.byTask.map((r) => (
                  <TableRow key={r.key}>
                    <TableCell>
                      <Badge variant="outline">{r.key}</Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{hrs(r.hours)}</TableCell>
                    <TableCell className="text-right tabular-nums">{usd(r.amount)}</TableCell>
                  </TableRow>
                ))}
                {summary.byTask.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground">
                      {t('ot.none')}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/** Entry form with a live preview of the 加班表 formula as the user types. */
function AddOvertimeForm({
  employees,
  tier1Rate,
  tier2Rate,
  tier1Label,
  tier2Label,
  defaultDate,
  onDone,
}: {
  employees: Opt[];
  tier1Rate: number;
  tier2Rate: number;
  tier1Label: string;
  tier2Label: string;
  defaultDate: string;
  onDone: () => void;
}) {
  const { t, m } = useT();
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    createOvertimeEntry,
    null,
  );

  const [timeRange, setTimeRange] = useState('');
  const [t1, setT1] = useState('');
  const [t2, setT2] = useState('');

  // Typing a range like 16:30-20:00 auto-fills both tier hour fields.
  function onRangeChange(value: string) {
    setTimeRange(value);
    const split = splitTimeRange(value);
    if (split) {
      setT1(String(split.tier1Hours ?? 0));
      setT2(String(split.tier2Hours ?? 0));
    }
  }

  const hours = { tier1Hours: num(t1), tier2Hours: num(t2) };
  const rates = { tier1Rate, tier2Rate };
  const a1 = tier1Amount(hours.tier1Hours, tier1Rate);
  const a2 = tier2Amount(hours.tier2Hours, tier2Rate);
  const total = overtimeTotal(hours, rates);

  useEffect(() => {
    if (state?.ok) {
      setTimeRange('');
      setT1('');
      setT2('');
      onDone();
    }
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps

  const err = (k: string) =>
    state?.fieldErrors?.[k] ? (
      <p className="text-xs text-destructive">{m(state.fieldErrors[k])}</p>
    ) : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('ot.add')}</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <Label htmlFor="ot-date">{t('ot.date')}</Label>
              <Input id="ot-date" name="businessDate" type="date" defaultValue={defaultDate} />
              {err('businessDate')}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ot-emp">{t('ot.employee')}</Label>
              <select id="ot-emp" name="employeeId" className={selectCls} defaultValue="">
                <option value="">{t('common.select')}</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
              {err('employeeId')}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ot-desc">{t('ot.task')}</Label>
              <Input id="ot-desc" name="description" placeholder="送货 / 焊网" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ot-range">{t('ot.timeRange')}</Label>
              <Input
                id="ot-range"
                name="timeRange"
                value={timeRange}
                onChange={(e) => onRangeChange(e.target.value)}
                placeholder="16:30-20:00"
              />
              <p className="text-[11px] text-muted-foreground">{t('ot.rangeHint')}</p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <Label htmlFor="ot-t1">
                {t('ot.tier1Hours')} · {tier1Label}
              </Label>
              <Input
                id="ot-t1"
                name="tier1Hours"
                type="number"
                step="0.25"
                min="0"
                value={t1}
                onChange={(e) => setT1(e.target.value)}
              />
              {err('tier1Hours')}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ot-t2">
                {t('ot.tier2Hours')} · {tier2Label}
              </Label>
              <Input
                id="ot-t2"
                name="tier2Hours"
                type="number"
                step="0.25"
                min="0"
                value={t2}
                onChange={(e) => setT2(e.target.value)}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="ot-notes">{t('common.notes')}</Label>
              <Input id="ot-notes" name="notes" />
            </div>
          </div>

          {/* Live formula preview */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 rounded-md bg-muted px-3 py-2 text-sm">
            <span>
              {tier1Label}: <strong className="tabular-nums">{usd(a1)}</strong>
              <span className="ml-1 text-xs text-muted-foreground">
                ({hours.tier1Hours || 0} × {usd(tier1Rate)})
              </span>
            </span>
            <span>
              {tier2Label}: <strong className="tabular-nums">{usd(a2)}</strong>
              <span className="ml-1 text-xs text-muted-foreground">
                ({hours.tier2Hours || 0} × {usd(tier2Rate)})
              </span>
            </span>
            <span>
              {t('ot.hours')}: <strong className="tabular-nums">{hrs(totalHours(hours))}</strong>
            </span>
            <span className="text-primary">
              {t('ot.totalAmount')}: <strong className="tabular-nums">{usd(total)}</strong>
            </span>
          </div>

          {state?.error && (
            <p className="rounded-md bg-destructive/10 px-3 py-1.5 text-sm text-destructive">
              {m(state.error)}
            </p>
          )}

          <div className="flex gap-2">
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              {t('common.save')}
            </Button>
            <Button type="button" variant="ghost" onClick={onDone}>
              {t('common.cancel')}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
