import { requirePermission } from '@/lib/auth';
import { hasPermission } from '@/lib/domain/rbac';
import { getEquipmentMaintenance, getEmployees } from '@/lib/db/queries';
import { getLocale } from '@/lib/i18n/locale';
import { translator } from '@/lib/i18n';
import { PageHeader } from '@/components/page-header';
import { MaintenanceClient } from './maintenance-client';

export const dynamic = 'force-dynamic';

export default async function MaintenancePage() {
  const user = await requirePermission('maintenance:view');
  const locale = await getLocale();
  const t = translator(locale);

  const [records, employees] = await Promise.all([getEquipmentMaintenance(), getEmployees()]);

  return (
    <div>
      <PageHeader title={t('maint.title')} description={t('maint.desc')} />
      <MaintenanceClient
        records={records}
        employees={employees.map((e) => ({
          id: e.id,
          name: e.display_name || e.name_english || e.name_chinese || e.employee_code,
        }))}
        canManage={hasPermission(user.role, 'maintenance:manage')}
      />
    </div>
  );
}
