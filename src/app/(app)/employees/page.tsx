import { requirePermission } from '@/lib/auth';
import { hasPermission, canViewSensitiveEmployeeData } from '@/lib/domain/rbac';
import { getEmployees, getAttendanceGroups, getAllEmployeePrivate } from '@/lib/db/queries';
import { getLocale } from '@/lib/i18n/locale';
import { translator } from '@/lib/i18n';
import { PageHeader } from '@/components/page-header';
import { EmployeesClient } from './employees-client';

export const dynamic = 'force-dynamic';

export default async function EmployeesPage() {
  const user = await requirePermission('employees:view');
  const locale = await getLocale();
  const t = translator(locale);
  const canSensitive = canViewSensitiveEmployeeData(user.role);
  const [employees, groups, privateRows] = await Promise.all([
    getEmployees(true),
    getAttendanceGroups(),
    canSensitive ? getAllEmployeePrivate() : Promise.resolve([]),
  ]);
  return (
    <div>
      <PageHeader title={t('emp.title')} description={t('emp.desc')} />
      <EmployeesClient
        employees={employees}
        groups={groups}
        canManage={hasPermission(user.role, 'employees:manage')}
        canSensitive={canSensitive}
        privateRows={privateRows}
      />
    </div>
  );
}
