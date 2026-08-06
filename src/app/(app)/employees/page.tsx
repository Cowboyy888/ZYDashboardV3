import { requirePermission } from '@/lib/auth';
import { hasPermission, canViewSensitiveEmployeeData } from '@/lib/domain/rbac';
import {
  getEmployees,
  getAttendanceGroups,
  getAllEmployeePrivate,
  getSignedPhotoUrls,
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
  // signed URLs when the viewer is actually allowed to see them. One batched
  // Storage call for every photo (not one round-trip per employee).
  let photoUrls: Record<string, string> = {};
  if (canSensitive) {
    const withPhotos = employees.filter((e) => e.photo_path);
    const paths = withPhotos.map((e) => e.photo_thumb_path ?? e.photo_path!);
    const urlByPath = await getSignedPhotoUrls(paths);
    photoUrls = Object.fromEntries(
      withPhotos
        .map((e): [string, string | undefined] => [
          e.id,
          urlByPath.get(e.photo_thumb_path ?? e.photo_path!),
        ])
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
