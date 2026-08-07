'use client';
import Link from 'next/link';
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
import { LiveDot } from '@/components/animated-stat';
import { useT } from '@/components/i18n-provider';
import { PAYROLL_STATUS_LABELS, isPayrollLive, type PayrollStatus } from '@/lib/domain/payroll';
import { formatDDMMYYYY } from '@/lib/domain/datetime';
import type { PayrollRunRow } from '@/lib/domain/payroll-view';

const STATUS_VARIANT: Record<
  PayrollStatus,
  'secondary' | 'success' | 'warning' | 'destructive' | 'outline'
> = {
  draft: 'outline',
  approved: 'warning',
  paid: 'success',
  cancelled: 'destructive',
};

export function RunsList({ rows }: { rows: PayrollRunRow[] }) {
  const { t, locale } = useT();
  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('pay.period')}</TableHead>
              <TableHead>{t('pay.payDate')}</TableHead>
              <TableHead>{t('common.status')}</TableHead>
              <TableHead className="text-right">{t('pay.employeeCount')}</TableHead>
              <TableHead className="text-right">{t('pay.netTotal')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.runId}>
                <TableCell>
                  <Link href={`/payroll/${r.runId}`} className="font-medium text-primary underline">
                    {formatDDMMYYYY(r.periodStart)} – {formatDDMMYYYY(r.periodEnd)}
                  </Link>
                </TableCell>
                <TableCell>{formatDDMMYYYY(r.payDate)}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5">
                    <Badge variant={STATUS_VARIANT[r.status]}>
                      {PAYROLL_STATUS_LABELS[r.status][locale]}
                    </Badge>
                    {isPayrollLive(r.status) && <LiveDot />}
                  </div>
                </TableCell>
                <TableCell className="text-right tabular-nums">{r.itemCount}</TableCell>
                <TableCell className="text-right font-semibold tabular-nums">
                  ${r.netTotal.toFixed(2)}
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  {t('pay.noRuns')}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
