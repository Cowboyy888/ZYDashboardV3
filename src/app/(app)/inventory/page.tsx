import { requirePermission } from '@/lib/auth';
import { hasPermission, canOverrideNegativeStock } from '@/lib/domain/rbac';
import {
  getSkus,
  getFamilies,
  getLocations,
  getBalances,
  getRecentMovements,
} from '@/lib/db/queries';
import { buildInventoryRows } from '@/lib/domain/inventory-view';
import { businessDate } from '@/lib/domain/datetime';
import type { MovementType } from '@/lib/domain/stock-ledger';
import { getLocale } from '@/lib/i18n/locale';
import { translator } from '@/lib/i18n';
import { PageHeader } from '@/components/page-header';
import { InventoryClient } from './inventory-client';

export const dynamic = 'force-dynamic';

const SINGLE_ENTRY_TYPES: MovementType[] = [
  'opening_balance',
  'production_output',
  'other_stock_out',
  'adjustment',
];

const PERM: Record<MovementType, Parameters<typeof hasPermission>[1]> = {
  opening_balance: 'stock:opening',
  purchase_receipt: 'stock:production',
  production_output: 'stock:production',
  sale_delivery: 'stock:out',
  other_stock_out: 'stock:out',
  adjustment: 'stock:adjust',
  transfer_out: 'stock:transfer',
  transfer_in: 'stock:transfer',
};

export default async function InventoryPage() {
  const user = await requirePermission('inventory:view');
  const locale = await getLocale();
  const t = translator(locale);
  const [skus, families, locations, balances, movements] = await Promise.all([
    getSkus(),
    getFamilies(),
    getLocations(),
    getBalances(),
    getRecentMovements(60),
  ]);

  const rows = buildInventoryRows(skus, families, locations, balances, locale);
  const allowedTypes = SINGLE_ENTRY_TYPES.filter((ty) => hasPermission(user.role, PERM[ty]));
  const canTransfer = hasPermission(user.role, 'stock:transfer');

  return (
    <div>
      <PageHeader title={t('inv.title')} description={t('inv.desc')} />
      <InventoryClient
        rows={rows}
        skus={skus}
        families={families.map((f) => ({ id: f.id, name: f.name, name_english: f.name_english }))}
        locations={locations.map((l) => ({ id: l.id, name: l.name, code: l.code }))}
        movements={movements}
        allowedTypes={allowedTypes}
        canTransfer={canTransfer}
        canOverride={canOverrideNegativeStock(user.role)}
        canSend={hasPermission(user.role, 'telegram:send')}
        canManageProducts={hasPermission(user.role, 'products:manage')}
        today={businessDate()}
      />
    </div>
  );
}
