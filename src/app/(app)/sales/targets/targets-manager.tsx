'use client';
import { useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
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
import { createOrUpdateSalesTarget } from '@/lib/actions/sales-performance';
import { gpTarget, impliedOrderValue } from '@/lib/domain/kpi';
import type { ActionState } from '@/lib/actions/types';
import type { SalesTargetDisplayRow } from '@/lib/domain/kpi-view';

interface EmployeeOption {
  id: string;
  name: string;
}

function TargetFields({
  employees,
  defaults,
}: {
  employees: EmployeeOption[];
  defaults?: Partial<SalesTargetDisplayRow>;
}) {
  const { t } = useT();
  const [revenue, setRevenue] = useState(defaults?.revenueTarget ?? 0);
  const [margin, setMargin] = useState(defaults?.targetMarginPct ?? 0);
  const [orders, setOrders] = useState(defaults?.ordersTarget ?? 0);
  const previewGpTarget = gpTarget({ revenueTarget: revenue, targetMarginPct: margin });
  const previewOrderValue = impliedOrderValue(revenue, orders);

  return (
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
      <div className="space-y-1.5">
        <Label htmlFor="revenueTarget">{t('tgt.revenueTarget')}</Label>
        <Input
          id="revenueTarget"
          name="revenueTarget"
          type="number"
          step="0.01"
          min="0"
          defaultValue={defaults?.revenueTarget ?? 0}
          onChange={(e) => setRevenue(Number(e.target.value) || 0)}
          required
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="targetMarginPct">{t('tgt.targetMarginPct')}</Label>
        <Input
          id="targetMarginPct"
          name="targetMarginPct"
          type="number"
          step="0.01"
          min="0"
          max="1"
          defaultValue={defaults?.targetMarginPct ?? 0}
          onChange={(e) => setMargin(Number(e.target.value) || 0)}
          required
        />
        <p className="text-xs text-muted-foreground">{t('tgt.targetMarginHint')}</p>
      </div>
      <div className="space-y-1.5">
        <Label>{t('tgt.gpTarget')}</Label>
        <p className="pt-2 text-sm font-medium">{previewGpTarget.toLocaleString()}</p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ordersTarget">{t('tgt.ordersTarget')}</Label>
        <Input
          id="ordersTarget"
          name="ordersTarget"
          type="number"
          step="1"
          min="0"
          defaultValue={defaults?.ordersTarget ?? 0}
          onChange={(e) => setOrders(Number(e.target.value) || 0)}
          required
        />
      </div>
      <div className="space-y-1.5">
        <Label>{t('tgt.impliedOrderValue')}</Label>
        <p className="pt-2 text-sm font-medium">{previewOrderValue.toLocaleString()}</p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="newCustomers">{t('tgt.newCustomers')}</Label>
        <Input
          id="newCustomers"
          name="newCustomers"
          type="number"
          step="1"
          min="0"
          defaultValue={defaults?.newCustomers ?? 0}
          required
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="quotationsWeek">{t('tgt.quotationsWeek')}</Label>
        <Input
          id="quotationsWeek"
          name="quotationsWeek"
          type="number"
          step="1"
          min="0"
          defaultValue={defaults?.quotationsWeek ?? 0}
          required
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="qualifiedWeek">{t('tgt.qualifiedWeek')}</Label>
        <Input
          id="qualifiedWeek"
          name="qualifiedWeek"
          type="number"
          step="1"
          min="0"
          defaultValue={defaults?.qualifiedWeek ?? 0}
          required
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="contactsDay">{t('tgt.contactsDay')}</Label>
        <Input
          id="contactsDay"
          name="contactsDay"
          type="number"
          step="1"
          min="0"
          defaultValue={defaults?.contactsDay ?? 0}
          required
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="visitsDay">{t('tgt.visitsDay')}</Label>
        <Input
          id="visitsDay"
          name="visitsDay"
          type="number"
          step="1"
          min="0"
          defaultValue={defaults?.visitsDay ?? 0}
          required
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="leadsDay">{t('tgt.leadsDay')}</Label>
        <Input
          id="leadsDay"
          name="leadsDay"
          type="number"
          step="1"
          min="0"
          defaultValue={defaults?.leadsDay ?? 0}
          required
        />
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="notes">{t('common.notes')}</Label>
        <Input id="notes" name="notes" defaultValue={defaults?.notes ?? ''} />
      </div>
    </div>
  );
}

function EditTargetRow({
  target,
  employees,
  onDone,
}: {
  target: SalesTargetDisplayRow;
  employees: EmployeeOption[];
  onDone: () => void;
}) {
  const { t } = useT();
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    createOrUpdateSalesTarget,
    null,
  );

  useEffect(() => {
    if (state?.ok) onDone();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <TableRow>
      <TableCell colSpan={8} className="bg-muted/30">
        <form action={formAction} className="space-y-3 py-2">
          <TargetFields employees={employees} defaults={target} />
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

function TargetRowItem({
  target,
  employees,
  canManage,
}: {
  target: SalesTargetDisplayRow;
  employees: EmployeeOption[];
  canManage: boolean;
}) {
  const { t } = useT();
  const router = useRouter();
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <EditTargetRow
        target={target}
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
      <TableCell className="font-medium">{target.employeeName}</TableCell>
      <TableCell>{target.period}</TableCell>
      <TableCell>{target.revenueTarget.toLocaleString()}</TableCell>
      <TableCell>{(target.targetMarginPct * 100).toFixed(1)}%</TableCell>
      <TableCell>{target.gpTarget.toLocaleString()}</TableCell>
      <TableCell>{target.ordersTarget}</TableCell>
      <TableCell>{target.impliedOrderValue.toLocaleString()}</TableCell>
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

export function TargetsManager({
  rows,
  employees,
  canManage,
  activePeriod,
}: {
  rows: SalesTargetDisplayRow[];
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
          {t('tgt.filter')}
        </Button>
      </form>

      {canManage && (
        <div className="flex justify-end">
          <Button
            variant={showCreate ? 'secondary' : 'default'}
            onClick={() => setShowCreate((s) => !s)}
          >
            {showCreate ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {showCreate ? t('common.close') : t('tgt.newTarget')}
          </Button>
        </div>
      )}

      {canManage && showCreate && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('tgt.newTarget')}</CardTitle>
          </CardHeader>
          <CardContent>
            <ActionForm action={createOrUpdateSalesTarget}>
              <TargetFields employees={employees} defaults={{ period: activePeriod }} />
              <SubmitButton>{t('tgt.saveTarget')}</SubmitButton>
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
                <TableHead>{t('tgt.revenueTarget')}</TableHead>
                <TableHead>{t('tgt.targetMarginPct')}</TableHead>
                <TableHead>{t('tgt.gpTarget')}</TableHead>
                <TableHead>{t('tgt.ordersTarget')}</TableHead>
                <TableHead>{t('tgt.impliedOrderValue')}</TableHead>
                {canManage && <TableHead className="text-right">{t('common.actions')}</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TargetRowItem key={r.id} target={r} employees={employees} canManage={canManage} />
              ))}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground">
                    {t('tgt.noTargets')}
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
