import { requirePermission } from '@/lib/auth';
import { hasPermission, canViewSensitiveEmployeeData } from '@/lib/domain/rbac';
import {
  getEmployees,
  getAttendanceGroups,
  getAllEmployeePrivate,
  getSignedPhotoUrl,
} from '@/lib/db/queries';
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

  // Photos are sensitive (same gate as salary/private docs) — only fetch
  // signed URLs when the viewer is actually allowed to see them.
  let photoUrls: Record<string, string> = {};
  if (canSensitive) {
    const withPhotos = employees.filter((e) => e.photo_path);
    const urls = await Promise.all(withPhotos.map((e) => getSignedPhotoUrl(e.photo_path)));
    photoUrls = Object.fromEntries(
      withPhotos
        .map((e, i) => [e.id, urls[i]])
        .filter((pair): pair is [string, string] => !!pair[1]),
    );
  }

  return (
    <div>
      <PageHeader title={t('emp.title')} description={t('emp.desc')} />
      <EmployeesClient
        employees={employees}
        groups={groups}
        canManage={hasPermission(user.role, 'employees:manage')}
        canSensitive={canSensitive}
        privateRows={privateRows}
        photoUrls={photoUrls}
      />
    </div>
  );
}
