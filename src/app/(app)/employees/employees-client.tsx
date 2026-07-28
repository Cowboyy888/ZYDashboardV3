'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
import type { AttendanceGroupRow, EmployeeRow } from '@/lib/db/types';

export function EmployeesClient({
  employees,
  groups,
  canManage,
}: {
  employees: EmployeeRow[];
  groups: AttendanceGroupRow[];
  canManage: boolean;
}) {
  const { t } = useT();
  const [showAdd, setShowAdd] = useState(false);
  const groupName = new Map(groups.map((g) => [g.id, g.name]));

  return (
    <div className="space-y-4">
      {canManage && (
        <div className="flex justify-end">
          <Button variant={showAdd ? 'secondary' : 'default'} onClick={() => setShowAdd((s) => !s)}>
            <Plus className="h-4 w-4" /> {showAdd ? t('common.close') : t('emp.add')}
          </Button>
        </div>
      )}

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
                <TableHead>{t('common.status')}</TableHead>
                {canManage && <TableHead className="text-right">{t('common.actions')}</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {employees.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="whitespace-nowrap font-mono text-xs">
                    {e.employee_code}
                    {e.employee_number ? ` · ${e.employee_number}号` : ''}
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/employees/${e.id}`}
                      className="font-medium hover:text-primary hover:underline"
                    >
                      {e.display_name || e.name_english || e.name_chinese || e.employee_code}
                    </Link>
                    {e.name_khmer && (
                      <div className="name-khmer text-xs text-muted-foreground">{e.name_khmer}</div>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {(e.attendance_group_id && groupName.get(e.attendance_group_id)) || '—'}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {e.pay_type === 'monthly' ? t('emp.monthly') : t('emp.daily')}
                    </Badge>
                  </TableCell>
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
              {employees.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={canManage ? 6 : 5}
                    className="text-center text-muted-foreground"
                  >
                    {t('emp.noEmployees')}
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
