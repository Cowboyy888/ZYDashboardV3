'use client';
import { ArrowUp, ArrowDown } from 'lucide-react';
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
  createAttendanceGroup,
  renameAttendanceGroup,
  reorderAttendanceGroup,
  toggleAttendanceGroup,
} from '@/lib/actions/settings';
import type { AttendanceGroupRow } from '@/lib/db/types';

export function AttendanceGroupsManager({ groups }: { groups: AttendanceGroupRow[] }) {
  const { t } = useT();
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-1">
        <CardHeader>
          <CardTitle className="text-base">{t('set.addGroup')}</CardTitle>
        </CardHeader>
        <CardContent>
          <ActionForm action={createAttendanceGroup}>
            <div className="space-y-1.5">
              <Label htmlFor="grp-name">{t('common.name')}</Label>
              <Input id="grp-name" name="name" placeholder="焊网机员工" required />
            </div>
            <SubmitButton>{t('common.add')}</SubmitButton>
          </ActionForm>
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="text-base">{t('set.groupsTable')}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">{t('set.order')}</TableHead>
                <TableHead>{t('common.name')}</TableHead>
                <TableHead>{t('common.status')}</TableHead>
                <TableHead className="text-right">{t('common.actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {groups.map((g, i) => (
                <TableRow key={g.id}>
                  <TableCell>
                    <div className="flex gap-1">
                      <ActionForm action={reorderAttendanceGroup} className="space-y-0">
                        <input type="hidden" name="id" value={g.id} />
                        <input type="hidden" name="direction" value="up" />
                        <SubmitButton variant="ghost" size="icon" disabled={i === 0}>
                          <ArrowUp className="h-4 w-4" />
                        </SubmitButton>
                      </ActionForm>
                      <ActionForm action={reorderAttendanceGroup} className="space-y-0">
                        <input type="hidden" name="id" value={g.id} />
                        <input type="hidden" name="direction" value="down" />
                        <SubmitButton
                          variant="ghost"
                          size="icon"
                          disabled={i === groups.length - 1}
                        >
                          <ArrowDown className="h-4 w-4" />
                        </SubmitButton>
                      </ActionForm>
                    </div>
                  </TableCell>
                  <TableCell>
                    <ActionForm
                      action={renameAttendanceGroup}
                      className="flex items-center gap-2 space-y-0"
                    >
                      <input type="hidden" name="id" value={g.id} />
                      <Input name="name" defaultValue={g.name} className="h-8 w-44" />
                      <SubmitButton variant="outline" size="sm">
                        {t('common.save')}
                      </SubmitButton>
                    </ActionForm>
                  </TableCell>
                  <TableCell>
                    <Badge variant={g.is_active ? 'success' : 'secondary'}>
                      {g.is_active ? t('common.active') : t('common.archived')}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <ActionForm action={toggleAttendanceGroup} className="space-y-0">
                      <input type="hidden" name="id" value={g.id} />
                      <input type="hidden" name="isActive" value={String(g.is_active)} />
                      <SubmitButton variant="ghost" size="sm">
                        {g.is_active ? t('common.archive') : t('common.reactivate')}
                      </SubmitButton>
                    </ActionForm>
                  </TableCell>
                </TableRow>
              ))}
              {groups.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    {t('set.noGroups')}
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
