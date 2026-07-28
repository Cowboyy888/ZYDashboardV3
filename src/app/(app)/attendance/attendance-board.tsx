'use client';
import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { StatCard } from '@/components/stat-card';
import { ActionForm } from '@/components/forms/action-form';
import { SubmitButton } from '@/components/forms/submit-button';
import { SendNowButton } from '@/components/telegram/send-now-button';
import { useT } from '@/components/i18n-provider';
import { markAttendance, bulkMarkPresent } from '@/lib/actions/attendance';
import { sendMorningNow, sendAfternoonNow } from '@/lib/actions/telegram';
import {
  summarizeShift,
  STATUS_LABELS,
  ATTENDANCE_STATUSES,
  type AttendanceRecord,
  type AttendanceStatus,
  type Shift,
} from '@/lib/domain/attendance';
import type { AttendanceRow, EmployeeRow } from '@/lib/db/types';

const SETTABLE = ATTENDANCE_STATUSES.filter((s) => s !== 'unmarked') as Exclude<
  AttendanceStatus,
  'unmarked'
>[];

const STATUS_VARIANT: Record<
  string,
  'success' | 'warning' | 'secondary' | 'destructive' | 'outline'
> = {
  present: 'success',
  late: 'warning',
  leave: 'secondary',
  absent: 'destructive',
  unmarked: 'outline',
};

export function AttendanceBoard({
  employees,
  records,
  date,
  canManage,
  canSend,
}: {
  employees: EmployeeRow[];
  records: AttendanceRow[];
  date: string;
  canManage: boolean;
  canSend: boolean;
}) {
  const { t, locale } = useT();
  const [shift, setShift] = useState<Shift>('morning');
  const activeIds = employees.map((e) => e.id);
  const asRecords: AttendanceRecord[] = records.map((r) => ({
    employeeId: r.employee_id,
    businessDate: r.business_date,
    shift: r.shift,
    status: r.status,
  }));
  const statusFor = (employeeId: string): AttendanceStatus => {
    const rec = records.find((r) => r.employee_id === employeeId && r.shift === shift);
    return rec?.status ?? 'unmarked';
  };
  const summary = summarizeShift(activeIds, asRecords, date, shift);

  return (
    <div className="space-y-4">
      <Tabs value={shift} onValueChange={(v) => setShift(v as Shift)}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList>
            <TabsTrigger value="morning">{t('att.morning')} · 07:30</TabsTrigger>
            <TabsTrigger value="afternoon">{t('att.afternoon')} · 12:30</TabsTrigger>
          </TabsList>
          {canSend && (
            <SendNowButton
              action={shift === 'morning' ? sendMorningNow : sendAfternoonNow}
              label={t('att.sendReport')}
            />
          )}
        </div>

        {(['morning', 'afternoon'] as const).map((s) => (
          <TabsContent key={s} value={s} className="space-y-4">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              <StatCard
                label={STATUS_LABELS.present[locale]}
                value={summary.present}
                tone="success"
              />
              <StatCard label={STATUS_LABELS.late[locale]} value={summary.late} tone="warning" />
              <StatCard label={STATUS_LABELS.leave[locale]} value={summary.leave} />
              <StatCard
                label={STATUS_LABELS.absent[locale]}
                value={summary.absent}
                tone="destructive"
              />
              <StatCard
                label={STATUS_LABELS.unmarked[locale]}
                value={summary.unmarked}
                tone={summary.unmarked > 0 ? 'warning' : 'success'}
              />
            </div>

            {summary.unmarked > 0 && (
              <div className="flex items-center gap-2 rounded-md border border-warning/40 bg-warning/10 px-4 py-2 text-sm text-warning-foreground">
                <AlertTriangle className="h-4 w-4 text-warning" />
                {summary.unmarked} {t('att.unmarkedWarn')}
              </div>
            )}

            {canManage && (
              <ActionForm action={bulkMarkPresent} className="space-y-0">
                <input type="hidden" name="businessDate" value={date} />
                <input type="hidden" name="shift" value={shift} />
                {activeIds.map((id) => (
                  <input key={id} type="hidden" name="employeeIds" value={id} />
                ))}
                <SubmitButton variant="secondary">{t('att.markAllPresent')}</SubmitButton>
              </ActionForm>
            )}

            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('att.employee')}</TableHead>
                      <TableHead>{t('common.status')}</TableHead>
                      {canManage && <TableHead>{t('att.set')}</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {employees.map((e) => {
                      const current = statusFor(e.id);
                      return (
                        <TableRow key={e.id}>
                          <TableCell>
                            <div className="font-medium">
                              {e.display_name ||
                                e.name_english ||
                                e.name_chinese ||
                                e.employee_code}
                            </div>
                            {e.name_khmer && (
                              <div className="name-khmer text-xs text-muted-foreground">
                                {e.name_khmer}
                              </div>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant={STATUS_VARIANT[current]}>
                              {STATUS_LABELS[current][locale]}
                            </Badge>
                          </TableCell>
                          {canManage && (
                            <TableCell>
                              <div className="flex flex-wrap gap-1">
                                {SETTABLE.map((st) => (
                                  <ActionForm
                                    key={st}
                                    action={markAttendance}
                                    className="space-y-0"
                                  >
                                    <input type="hidden" name="employeeId" value={e.id} />
                                    <input type="hidden" name="businessDate" value={date} />
                                    <input type="hidden" name="shift" value={shift} />
                                    <input type="hidden" name="status" value={st} />
                                    <SubmitButton
                                      variant={current === st ? 'default' : 'outline'}
                                      size="sm"
                                    >
                                      {STATUS_LABELS[st][locale]}
                                    </SubmitButton>
                                  </ActionForm>
                                ))}
                              </div>
                            </TableCell>
                          )}
                        </TableRow>
                      );
                    })}
                    {employees.length === 0 && (
                      <TableRow>
                        <TableCell
                          colSpan={canManage ? 3 : 2}
                          className="text-center text-muted-foreground"
                        >
                          {t('att.noActive')}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
