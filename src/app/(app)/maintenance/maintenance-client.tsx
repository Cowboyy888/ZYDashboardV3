'use client';
import { useActionState, useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { NativeSelect } from '@/components/ui/native-select';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { FormError } from '@/components/forms/form-error';
import { useT } from '@/components/i18n-provider';
import {
  createMaintenanceRecord,
  updateMaintenanceRecord,
  deleteMaintenanceRecord,
} from '@/lib/actions/maintenance';
import { maintenanceStatus, type MaintenanceStatus } from '@/lib/domain/maintenance';
import { formatDDMMYYYY, businessDate } from '@/lib/domain/datetime';
import type { ActionState } from '@/lib/actions/types';
import type { EquipmentMaintenanceRow } from '@/lib/db/types';
import type { MessageKey } from '@/lib/i18n';

type Opt = { id: string; name: string };

const STATUS_VARIANT: Record<
  MaintenanceStatus,
  'destructive' | 'warning' | 'success' | 'secondary'
> = {
  overdue: 'destructive',
  due_soon: 'warning',
  ok: 'success',
  none: 'secondary',
};

const STATUS_KEY: Record<MaintenanceStatus, MessageKey> = {
  overdue: 'maint.status.overdue',
  due_soon: 'maint.status.dueSoon',
  ok: 'maint.status.ok',
  none: 'maint.status.none',
};

export function MaintenanceClient({
  records,
  employees,
  canManage,
}: {
  records: EquipmentMaintenanceRow[];
  employees: Opt[];
  canManage: boolean;
}) {
  const { t } = useT();
  const today = businessDate();
  const [showAdd, setShowAdd] = useState(false);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [editing, setEditing] = useState<EquipmentMaintenanceRow | null>(null);
  const [deleting, setDeleting] = useState<EquipmentMaintenanceRow | null>(null);

  const technicianName = useMemo(() => new Map(employees.map((e) => [e.id, e.name])), [employees]);

  const visibleRecords = useMemo(() => {
    const q = query.trim().toLowerCase();
    return records
      .filter((r) => !statusFilter || maintenanceStatus(r.next_due_date, today) === statusFilter)
      .filter((r) => {
        if (!q) return true;
        return [
          r.machine_name,
          r.technician_id ? technicianName.get(r.technician_id) : null,
          r.notes,
        ]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q));
      });
  }, [records, query, statusFilter, technicianName, today]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('maint.search')}
              className="h-9 w-64 pl-8"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="maint-filter-status">{t('maint.statusFilter')}</Label>
            <NativeSelect
              id="maint-filter-status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-9 w-40"
            >
              <option value="">{t('common.all')}</option>
              <option value="overdue">{t('maint.status.overdue')}</option>
              <option value="due_soon">{t('maint.status.dueSoon')}</option>
              <option value="ok">{t('maint.status.ok')}</option>
              <option value="none">{t('maint.status.none')}</option>
            </NativeSelect>
          </div>
        </div>
        {canManage && (
          <Button variant={showAdd ? 'secondary' : 'default'} onClick={() => setShowAdd((s) => !s)}>
            {showAdd ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {showAdd ? t('common.close') : t('maint.new')}
          </Button>
        )}
      </div>

      {canManage && showAdd && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('maint.new')}</CardTitle>
          </CardHeader>
          <CardContent>
            <MaintenanceForm
              action={createMaintenanceRecord}
              employees={employees}
              onDone={() => setShowAdd(false)}
            />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('maint.machine')}</TableHead>
                <TableHead>{t('maint.technician')}</TableHead>
                <TableHead>{t('maint.performedOn')}</TableHead>
                <TableHead>{t('maint.nextDueDate')}</TableHead>
                <TableHead>{t('maint.status')}</TableHead>
                <TableHead>{t('common.notes')}</TableHead>
                {canManage && <TableHead className="text-right">{t('common.actions')}</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleRecords.map((r) => {
                const status = maintenanceStatus(r.next_due_date, today);
                return (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.machine_name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {(r.technician_id && technicianName.get(r.technician_id)) || '—'}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm">
                      {formatDDMMYYYY(r.performed_on)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm">
                      {r.next_due_date ? formatDDMMYYYY(r.next_due_date) : t('maint.noNextDue')}
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[status]}>{t(STATUS_KEY[status])}</Badge>
                    </TableCell>
                    <TableCell className="max-w-xs truncate text-sm text-muted-foreground">
                      {r.notes || '—'}
                    </TableCell>
                    {canManage && (
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => setEditing(r)}>
                            {t('common.edit')}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => setDeleting(r)}
                          >
                            {t('common.delete')}
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
              {visibleRecords.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={6 + (canManage ? 1 : 0)}
                    className="text-center text-muted-foreground"
                  >
                    {records.length === 0 ? t('maint.none') : t('maint.noneMatch')}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {canManage && editing && (
        <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
          <DialogContent className="max-w-lg text-left">
            <DialogHeader>
              <DialogTitle>{t('maint.edit')}</DialogTitle>
            </DialogHeader>
            <MaintenanceForm
              action={updateMaintenanceRecord}
              employees={employees}
              record={editing}
              onDone={() => setEditing(null)}
            />
          </DialogContent>
        </Dialog>
      )}

      <DeleteDialog row={deleting} onDone={() => setDeleting(null)} t={t} />
    </div>
  );
}

function MaintenanceForm({
  action,
  employees,
  record,
  onDone,
}: {
  action: (s: ActionState, f: FormData) => Promise<ActionState>;
  employees: Opt[];
  record?: EquipmentMaintenanceRow;
  onDone: () => void;
}) {
  const { t, m } = useT();
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, null);

  useEffect(() => {
    if (state?.ok) onDone();
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps

  const fieldError = (k: string) => {
    const msg = state?.fieldErrors?.[k];
    return msg ? <p className="text-xs text-destructive">{m(msg)}</p> : null;
  };
  const invalid = (k: string) => (state?.fieldErrors?.[k] ? 'border-destructive' : '');

  return (
    <form action={formAction} className="space-y-4">
      {record && <input type="hidden" name="id" value={record.id} />}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="mf-machine">
            {t('maint.machine')} <span className="text-destructive">*</span>
          </Label>
          <Input
            id="mf-machine"
            name="machineName"
            defaultValue={record?.machine_name ?? ''}
            className={invalid('machineName')}
          />
          {fieldError('machineName')}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="mf-technician">{t('maint.technician')}</Label>
          <NativeSelect
            id="mf-technician"
            name="technicianId"
            defaultValue={record?.technician_id ?? ''}
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
          <Label htmlFor="mf-performed">
            {t('maint.performedOn')} <span className="text-destructive">*</span>
          </Label>
          <Input
            id="mf-performed"
            name="performedOn"
            type="date"
            defaultValue={record?.performed_on ?? businessDate()}
            className={invalid('performedOn')}
          />
          {fieldError('performedOn')}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="mf-next-due">{t('maint.nextDueDate')}</Label>
          <Input
            id="mf-next-due"
            name="nextDueDate"
            type="date"
            defaultValue={record?.next_due_date ?? ''}
            className={invalid('nextDueDate')}
          />
          {fieldError('nextDueDate')}
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="mf-notes">{t('common.notes')}</Label>
          <Textarea id="mf-notes" name="notes" rows={2} defaultValue={record?.notes ?? ''} />
        </div>
      </div>

      <FormError error={state?.error} />

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
  );
}

function DeleteDialog({
  row,
  onDone,
  t,
}: {
  row: EquipmentMaintenanceRow | null;
  onDone: () => void;
  t: (k: MessageKey) => string;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    deleteMaintenanceRecord,
    null,
  );
  useEffect(() => {
    if (state?.ok) onDone();
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Dialog open={!!row} onOpenChange={(o) => !o && onDone()}>
      <DialogContent className="text-left">
        <DialogHeader>
          <DialogTitle>{t('maint.deleteTitle')}</DialogTitle>
          <DialogDescription>
            {t('maint.deleteBody')} {row?.machine_name}
          </DialogDescription>
        </DialogHeader>
        <FormError error={state?.error} />
        <div className="flex justify-end gap-2">
          <DialogClose asChild>
            <Button type="button" variant="ghost" onClick={onDone}>
              {t('common.cancel')}
            </Button>
          </DialogClose>
          <form action={formAction}>
            <input type="hidden" name="id" value={row?.id ?? ''} />
            <Button type="submit" variant="destructive" disabled={pending}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              {t('common.delete')}
            </Button>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
