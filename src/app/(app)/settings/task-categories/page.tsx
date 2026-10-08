import { requirePermission } from '@/lib/auth';
import { getTaskDepartments, getTaskCategories, getTaskMetricTypes } from '@/lib/db/queries';
import { getLocale } from '@/lib/i18n/locale';
import { translator } from '@/lib/i18n';
import { PageHeader } from '@/components/page-header';
import { TaskCategoriesManager } from './task-categories-manager';

export const dynamic = 'force-dynamic';

export default async function TaskCategoriesSettingsPage() {
  await requirePermission('settings:manage');
  const locale = await getLocale();
  const t = translator(locale);
  const [departments, categories, metricTypes] = await Promise.all([
    getTaskDepartments(true),
    getTaskCategories(true),
    getTaskMetricTypes(true),
  ]);
  return (
    <div>
      <PageHeader title={t('set.taskCategories')} description={t('set.taskCategoriesDesc')} />
      <TaskCategoriesManager
        departments={departments}
        categories={categories}
        metricTypes={metricTypes}
      />
    </div>
  );
}
