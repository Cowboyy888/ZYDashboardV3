import Link from 'next/link';
import { requirePermission } from '@/lib/auth';
import { hasPermission } from '@/lib/domain/rbac';
import {
  getPurchaseOrders,
  getPurchaseOrderItems,
  getSuppliers,
  getSkus,
  getFamilies,
  type PurchaseOrderFilters,
} from '@/lib/db/queries';
import { buildPurchaseOrderRows } from '@/lib/domain/purchasing-view';
import { isPoStatus, type PoStatus } from '@/lib/domain/purchasing';
import { getLocale } from '@/lib/i18n/locale';
import { translator } from '@/lib/i18n';
import { PageHeader } from '@/components/page-header';
import { buttonVariants } from '@/components/ui/button-variants';
import { PurchasingNav } from '../purchasing-nav';
import { OrdersList } from './orders-list';

export const dynamic = 'force-dynamic';

interface PageSearchParams {
  po?: string;
  supplierId?: string;
  status?: string;
  from?: string;
  to?: string;
  familyId?: string;
}

export default async function PurchaseOrdersPage({
  searchParams,
}: {
  searchParams: Promise<PageSearchParams>;
}) {
  const user = await requirePermission('purchasing:view');
  const locale = await getLocale();
  const t = translator(locale);
  const sp = await searchParams;
  const iso = /^\d{4}-\d{2}-\d{2}$/;

  const filters: PurchaseOrderFilters = {
    poNumber: sp.po?.trim() || undefined,
    supplierId: sp.supplierId || undefined,
    status: isPoStatus(sp.status) ? (sp.status as PoStatus) : undefined,
    from: iso.test(sp.from ?? '') ? sp.from : undefined,
    to: iso.test(sp.to ?? '') ? sp.to : undefined,
    familyId: sp.familyId || undefined,
  };

  const [pos, allItems, suppliers, skus, families] = await Promise.all([
    getPurchaseOrders(filters),
    getPurchaseOrderItems(),
    getSuppliers(true),
    getSkus(true),
    getFamilies(true),
  ]);
  const rows = buildPurchaseOrderRows(pos, allItems, suppliers, skus, families, locale);

  return (
    <div>
      <PageHeader
        title={t('pur.orders')}
        description={t('pur.dashDesc')}
        actions={
          hasPermission(user.role, 'purchasing:manage') && (
            <Link href="/purchasing/orders/new" className={buttonVariants()}>
              {t('pur.newPo')}
            </Link>
          )
        }
      />
      <PurchasingNav active="orders" />
      <OrdersList
        rows={rows}
        suppliers={suppliers.map((s) => ({ id: s.id, name: s.name }))}
        families={families.map((f) => ({ id: f.id, name: f.name }))}
        filters={{
          po: sp.po ?? '',
          supplierId: sp.supplierId ?? '',
          status: sp.status ?? '',
          from: sp.from ?? '',
          to: sp.to ?? '',
          familyId: sp.familyId ?? '',
        }}
      />
    </div>
  );
}
