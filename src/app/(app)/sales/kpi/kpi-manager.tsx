'use client';
import { useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
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
import { FormError } from '@/components/forms/form-error';
import { useT } from '@/components/i18n-provider';
import { saveKpiScorecard } from '@/lib/actions/sales-performance';
import { DEFAULT_KPI_LINES, KPI_RATING_LABELS, scoreCard, type KpiRating } from '@/lib/domain/kpi';
import type { ActionState } from '@/lib/actions/types';
import type { KpiScorecardDisplayRow } from '@/lib/domain/kpi-view';
import type { Locale } from '@/lib/i18n';

interface EmployeeOption {
  id: string;
  name: string;
}

interface LineDraft {
  label: string;
  weight: number;
  target: number | null;
  actual: number | null;
  lowerIsBetter: boolean;
}

function defaultLines(): LineDraft[] {
  return DEFAULT_KPI_LINES.map((l) => ({
    label: l.label,
    weight: l.weight,
    target: null,
    actual: null,
    lowerIsBetter: !!l.lowerIsBetter,
  }));
}

function linesFromScorecard(lines: KpiScorecardDisplayRow['lines']): LineDraft[] {
  if (lines.length === 0) return defaultLines();
  return lines.map((l) => ({
    label: l.label,
    weight: l.weight,
    target: l.target,
    actual: l.actual,
    lowerIsBetter: !!l.lowerIsBetter,
  }));
}

function ratingBadgeVariant(
  rating: KpiRating,
): 'success' | 'secondary' | 'warning' | 'destructive' {
  if (rating === 'outstanding' || rating === 'strong') return 'success';
  if (rating === 'developing') return 'secondary';
  if (rating === 'concern') return 'warning';
  return 'destructive';
}

function RatingBadge({ rating, locale }: { rating: KpiRating; locale: Locale }) {
  return <Badge variant={ratingBadgeVariant(rating)}>{KPI_RATING_LABELS[rating][locale]}</Badge>;
}

function ScorecardFields({
  employees,
  defaults,
}: {
  employees: EmployeeOption[];
  defaults?: Partial<KpiScorecardDisplayRow>;
}) {
  const { t, locale } = useT();
  const [lines, setLines] = useState<LineDraft[]>(
    defaults?.lines ? linesFromScorecard(defaults.lines) : defaultLines(),
  );
  const preview = scoreCard(
    lines.map((l) => ({
      label: l.label,
      weight: l.weight,
      target: l.target,
      actual: l.actual,
      lowerIsBetter: l.lowerIsBetter,
    })),
  );

  function updateLine(i: number, patch: Partial<LineDraft>) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="employeeId">{t('pay.employee')}</Label>
          <NativeSelect
            id="employeeId"
            name="employeeId"
            defaultValue={defaults?.employeeId}
            required
          >
            <option value="">{t('common.select')}</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="period">{t('pay.period')}</Label>
          <Input id="period" name="period" type="month" defaultValue={defaults?.period} required />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="notes">{t('common.notes')}</Label>
          <Input id="notes" name="notes" defaultValue={defaults?.notes ?? ''} />
        </div>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('kpi.line')}</TableHead>
              <TableHead>{t('kpi.weight')}</TableHead>
              <TableHead>{t('kpi.target')}</TableHead>
              <TableHead>{t('kpi.actual')}</TableHead>
              <TableHead>{t('kpi.totalScore')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map((l, i) => {
              const scored = preview.lines[i];
              return (
                <TableRow key={i}>
                  <TableCell>
                    <input
                      type="hidden"
                      name="lineLowerIsBetter"
                      value={l.lowerIsBetter ? 'true' : 'false'}
                    />
                    <Input
                      name="lineLabel"
                      value={l.label}
                      onChange={(e) => updateLine(i, { label: e.target.value })}
                      className="min-w-[220px]"
                    />
                    {l.lowerIsBetter && (
                      <p className="mt-1 text-xs text-muted-foreground">{t('kpi.lowerIsBetter')}</p>
                    )}
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      max="1"
                      name="lineWeight"
                      value={l.weight}
                      onChange={(e) => updateLine(i, { weight: Number(e.target.value) || 0 })}
                      className="w-20"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      step="0.0001"
                      name="lineTarget"
                      value={l.target ?? ''}
                      onChange={(e) =>
                        updateLine(i, {
                          target: e.target.value === '' ? null : Number(e.target.value),
                        })
                      }
                      className="w-28"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      step="0.0001"
                      name="lineActual"
                      value={l.actual ?? ''}
                      onChange={(e) =>
                        updateLine(i, {
                          actual: e.target.value === '' ? null : Number(e.target.value),
                        })
                      }
                      className="w-28"
                    />
                  </TableCell>
                  <TableCell>{scored?.weightedScore ?? '—'}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-md bg-muted/40 p-3">
        <span className="text-sm font-medium">
          {t('kpi.totalScore')}: {preview.totalScore}
        </span>
        <RatingBadge rating={preview.rating} locale={locale} />
        {preview.weightsUnbalanced && (
          <span className="text-xs text-warning">{t('kpi.weightsUnbalanced')}</span>
        )}
      </div>
    </div>
  );
}

function EditScorecardRow({
  scorecard,
  employees,
  onDone,
}: {
  scorecard: KpiScorecardDisplayRow;
  employees: EmployeeOption[];
  onDone: () => void;
}) {
  const { t } = useT();
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    saveKpiScorecard,
    null,
  );

  useEffect(() => {
    if (state?.ok) onDone();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <TableRow>
      <TableCell colSpan={5} className="bg-muted/30">
        <form action={formAction} className="space-y-3 py-2">
          <ScorecardFields employees={employees} defaults={scorecard} />
          <FormError error={state?.error} />
          <div className="flex gap-2">
            <SubmitButton>{t('common.save')}</SubmitButton>
            <button
              type="button"
              className="text-sm text-muted-foreground underline"
              disabled={pending}
              onClick={onDone}
            >
              {t('common.cancel')}
            </button>
          </div>
        </form>
      </TableCell>
    </TableRow>
  );
}

function ScorecardRowItem({
  scorecard,
  employees,
  canManage,
}: {
  scorecard: KpiScorecardDisplayRow;
  employees: EmployeeOption[];
  canManage: boolean;
}) {
  const { t, locale } = useT();
  const router = useRouter();
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <EditScorecardRow
        scorecard={scorecard}
        employees={employees}
        onDone={() => {
          setEditing(false);
          router.refresh();
        }}
      />
    );
  }

  return (
    <TableRow>
      <TableCell className="font-medium">{scorecard.employeeName}</TableCell>
      <TableCell>{scorecard.period}</TableCell>
      <TableCell>{scorecard.totalScore}</TableCell>
      <TableCell>
        <RatingBadge rating={scorecard.rating} locale={locale} />
      </TableCell>
      {canManage && (
        <TableCell className="text-right">
          <button
            type="button"
            className="text-sm text-primary underline"
            onClick={() => setEditing(true)}
          >
            {t('common.edit')}
          </button>
        </TableCell>
      )}
    </TableRow>
  );
}

export function KpiManager({
  rows,
  employees,
  canManage,
  activePeriod,
}: {
  rows: KpiScorecardDisplayRow[];
  employees: EmployeeOption[];
  canManage: boolean;
  activePeriod: string;
}) {
  const { t } = useT();
  const [showCreate, setShowCreate] = useState(false);

  return (
    <div className="space-y-4">
      <form className="flex flex-wrap items-end gap-2">
        <div className="space-y-1.5">
          <Label htmlFor="period-filter">{t('pay.period')}</Label>
          <Input id="period-filter" name="period" type="month" defaultValue={activePeriod} />
        </div>
        <Button type="submit" variant="outline">
          {t('kpi.filter')}
        </Button>
      </form>

      {canManage && (
        <div className="flex justify-end">
          <Button
            variant={showCreate ? 'secondary' : 'default'}
            onClick={() => setShowCreate((s) => !s)}
          >
            {showCreate ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {showCreate ? t('common.close') : t('kpi.newScorecard')}
          </Button>
        </div>
      )}

      {canManage && showCreate && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('kpi.newScorecard')}</CardTitle>
          </CardHeader>
          <CardContent>
            <ActionForm action={saveKpiScorecard}>
              <ScorecardFields employees={employees} defaults={{ period: activePeriod }} />
              <SubmitButton>{t('kpi.saveScorecard')}</SubmitButton>
            </ActionForm>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('pay.employee')}</TableHead>
                <TableHead>{t('pay.period')}</TableHead>
                <TableHead>{t('kpi.totalScore')}</TableHead>
                <TableHead>{t('kpi.rating')}</TableHead>
                {canManage && <TableHead className="text-right">{t('common.actions')}</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <ScorecardRowItem
                  key={r.id}
                  scorecard={r}
                  employees={employees}
                  canManage={canManage}
                />
              ))}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    {t('kpi.noScorecards')}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
