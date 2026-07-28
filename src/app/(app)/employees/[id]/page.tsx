import { notFound } from 'next/navigation';
import { Lock, User, ListOrdered } from 'lucide-react';
import { requirePermission } from '@/lib/auth';
import { hasPermission, canViewSensitiveEmployeeData } from '@/lib/domain/rbac';
import {
  getEmployee,
  getEmployeePrivate,
  getSignedPhotoUrl,
  getAttendanceGroups,
} from '@/lib/db/queries';
import { formatDDMMYYYY } from '@/lib/domain/datetime';
import { getLocale } from '@/lib/i18n/locale';
import { translator } from '@/lib/i18n';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PhotoUpload } from './photo-upload';
import { PrivateForm } from './private-form';
import { EmployeeProfileForm } from './profile-form';

export const dynamic = 'force-dynamic';

export default async function EmployeeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePermission('employees:view');
  const locale = await getLocale();
  const t = translator(locale);
  const [employee, groups] = await Promise.all([getEmployee(id), getAttendanceGroups(true)]);
  if (!employee) notFound();

  const canSensitive = canViewSensitiveEmployeeData(user.role);
  const canManage = hasPermission(user.role, 'employees:manage');
  const priv = canSensitive ? await getEmployeePrivate(id) : null;
  const photoUrl = canSensitive ? await getSignedPhotoUrl(employee.photo_path) : null;
  const groupName = groups.find((g) => g.id === employee.attendance_group_id)?.name ?? '—';

  return (
    <div>
      <PageHeader
        title={
          employee.display_name ||
          employee.name_english ||
          employee.name_chinese ||
          employee.employee_code
        }
        description={`${t('emp.empId')} ${employee.employee_code}${employee.employee_number ? ` · ${employee.employee_number}号` : ''}`}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">{t('emp.profile')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-muted">
                {photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photoUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <User className="h-7 w-7 text-muted-foreground" />
                )}
              </div>
              <div>
                {employee.name_khmer && (
                  <div className="name-khmer font-medium">{employee.name_khmer}</div>
                )}
                {employee.name_chinese && <div className="text-sm">{employee.name_chinese}</div>}
                <Badge variant={employee.is_active ? 'success' : 'secondary'} className="mt-1">
                  {employee.is_active ? t('common.active') : t('common.inactive')}
                </Badge>
              </div>
            </div>
            {canManage && !canSensitive && (
              <p className="text-xs text-muted-foreground">{t('emp.photoAdminNote')}</p>
            )}
            {canManage && canSensitive && <PhotoUpload employeeId={employee.id} />}
            <dl className="grid grid-cols-2 gap-y-2 text-sm">
              <dt className="text-muted-foreground">{t('emp.groupCol')}</dt>
              <dd>{groupName}</dd>
              <dt className="text-muted-foreground">{t('emp.jobTitle')}</dt>
              <dd>{employee.job_title || '—'}</dd>
              <dt className="text-muted-foreground">{t('emp.label')}</dt>
              <dd>{employee.label || '—'}</dd>
              <dt className="text-muted-foreground">{t('emp.phone')}</dt>
              <dd>{employee.phone || '—'}</dd>
              <dt className="text-muted-foreground">{t('emp.department')}</dt>
              <dd>{employee.department || '—'}</dd>
              <dt className="text-muted-foreground">{t('emp.startDate')}</dt>
              <dd>{employee.start_date ? formatDDMMYYYY(employee.start_date) : '—'}</dd>
              <dt className="text-muted-foreground">{t('emp.payType')}</dt>
              <dd>{employee.pay_type === 'monthly' ? t('emp.monthly') : t('emp.daily')}</dd>
            </dl>
          </CardContent>
        </Card>

        <div className="space-y-4 lg:col-span-2">
          {canManage && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <ListOrdered className="h-4 w-4 text-primary" /> {t('emp.reportProfile')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <EmployeeProfileForm employee={employee} groups={groups} />
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Lock className="h-4 w-4 text-primary" /> {t('emp.payroll')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {canSensitive ? (
                <PrivateForm employeeId={employee.id} data={priv} />
              ) : (
                <div className="flex items-center gap-2 rounded-md bg-muted px-4 py-6 text-sm text-muted-foreground">
                  <Lock className="h-4 w-4" />
                  {t('emp.salaryRestricted')}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
