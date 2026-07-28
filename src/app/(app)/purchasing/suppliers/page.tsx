import { requirePermission } from '@/lib/auth';
import { hasPermission } from '@/lib/domain/rbac';
import { getSuppliers } from '@/lib/db/queries';
import { getLocale } from '@/lib/i18n/locale';
import { translator } from '@/lib/i18n';
import { PageHeader } from '@/components/page-header';
import { PurchasingNav } from '../purchasing-nav';
import { SuppliersManager } from './suppliers-manager';

export const dynamic = 'force-dynamic';

export default async function SuppliersPage() {
  const user = await requirePermission('purchasing:view');
  const locale = await getLocale();
  const t = translator(locale);
  const suppliers = await getSuppliers(true);

  return (
    <div>
      <PageHeader title={t('pur.suppliers')} description={t('pur.suppliersDesc')} />
      <PurchasingNav active="suppliers" />
      <SuppliersManager
        suppliers={suppliers}
        canManage={hasPermission(user.role, 'purchasing:manage')}
      />
    </div>
  );
}
