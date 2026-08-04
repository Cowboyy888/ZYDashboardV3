'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { toggleEmployee } from '@/lib/actions/employees';
import { CreateEmployeeForm } from './create-employee-form';
import type { AttendanceGroupRow, EmployeeRow, EmployeePrivateRow } from '@/lib/db/types';

export function EmployeesClient({
  employees,
  groups,
  canManage,
  canSensitive,
  privateRows,
  photoUrls,
}: {
  employees: EmployeeRow[];
  groups: AttendanceGroupRow[];
  canManage: boolean;
  canSensitive: boolean;
  privateRows: EmployeePrivateRow[];
  photoUrls: Record<string, string>;
}) {
  const { t } = useT();
  const [showAdd, setShowAdd] = useState(false);
  const [query, setQuery] = useState('');
  const groupName = new Map(groups.map((g) => [g.id, g.name]));
  const privateByEmployee = new Map(privateRows.map((p) => [p.employee_id, p]));

  const visibleEmployees = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter((e) =>
      [
        e.employee_code,
        e.display_name,
        e.name_english,
        e.name_chinese,
        e.name_khmer,
        e.job_title,
        e.attendance_group_id ? groupName.get(e.attendance_group_id) : null,
      ]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [employees, query, groupName]);

  function rateLabel(e: EmployeeRow): string {
    // Postgres `numeric` columns come back from PostgREST as strings, not
    // numbers, despite the TS type — coerce before formatting (same pattern
    // used everywhere else this app does arithmetic on a numeric column).
    const priv = privateByEmployee.get(e.id);
    return priv?.daily_rate != null
      ? `$${Number(priv.daily_rate).toFixed(2)}${t('emp.perDay')}`
      : '—';
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('emp.search')}
            className="h-9 w-64 pl-8"
          />
        </div>
        {canManage && (
          <Button variant={showAdd ? 'secondary' : 'default'} onClick={() => setShowAdd((s) => !s)}>
            <Plus className="h-4 w-4" /> {showAdd ? t('common.close') : t('emp.add')}
          </Button>
        )}
      </div>

      {canManage && showAdd && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('emp.new')}</CardTitle>
          </CardHeader>
          <CardContent>
            <CreateEmployeeForm groups={groups} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('common.id')}</TableHead>
                <TableHead>{t('emp.nameCol')}</TableHead>
                <TableHead>{t('emp.groupCol')}</TableHead>
                <TableHead>{t('emp.payType')}</TableHead>
                {canSensitive && <TableHead>{t('emp.rateCol')}</TableHead>}
                <TableHead>{t('common.status')}</TableHead>
                {canManage && <TableHead className="text-right">{t('common.actions')}</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleEmployees.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="whitespace-nowrap font-mono text-xs">
                    {e.employee_code}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      {canSensitive && (
                        <EmployeeAvatar
                          photoUrl={photoUrls[e.id]}
                          name={
                            e.display_name || e.name_english || e.name_chinese || e.employee_code
                          }
                        />
                      )}
                      <div>
                        <Link
                          href={`/employees/${e.id}`}
                          className="font-medium hover:text-primary hover:underline"
                        >
                          {e.display_name || e.name_english || e.name_chinese || e.employee_code}
                        </Link>
                        {e.name_khmer && (
                          <div className="name-khmer text-xs text-muted-foreground">
                            {e.name_khmer}
                          </div>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {(e.attendance_group_id && groupName.get(e.attendance_group_id)) || '—'}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{t('emp.daily')}</Badge>
                  </TableCell>
                  {canSensitive && (
                    <TableCell className="text-sm tabular-nums">{rateLabel(e)}</TableCell>
                  )}
                  <TableCell>
                    <Badge variant={e.is_active ? 'success' : 'secondary'}>
                      {e.is_active ? t('common.active') : t('common.inactive')}
                    </Badge>
                  </TableCell>
                  {canManage && (
                    <TableCell className="text-right">
                      <ActionForm action={toggleEmployee} className="space-y-0">
                        <input type="hidden" name="id" value={e.id} />
                        <input type="hidden" name="isActive" value={String(e.is_active)} />
                        <SubmitButton variant="ghost" size="sm">
                          {e.is_active ? t('common.deactivate') : t('common.activate')}
                        </SubmitButton>
                      </ActionForm>
                    </TableCell>
                  )}
                </TableRow>
              ))}
              {visibleEmployees.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={5 + (canSensitive ? 1 : 0) + (canManage ? 1 : 0)}
                    className="text-center text-muted-foreground"
                  >
                    {employees.length === 0 ? t('emp.noEmployees') : t('emp.noEmployeesMatch')}
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

/** Small round thumbnail for the list row — initial-letter fallback when there's no photo. */
function EmployeeAvatar({ photoUrl, name }: { photoUrl: string | undefined; name: string }) {
  if (photoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={photoUrl} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />
    );
  }
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
      {name.charAt(0).toUpperCase()}
    </div>
  );
}
