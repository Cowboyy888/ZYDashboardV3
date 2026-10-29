import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { movementSchema } from '@/lib/validation/schemas';
import { CURRENCIES, isCurrency } from '@/lib/domain/currency';
import { balanceForSkuLocation } from '@/lib/domain/stock-ledger';

const root = resolve(import.meta.dirname, '../..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

describe('purchasing retirement', () => {
  it('removes dashboard/navigation entry points and all purchasing handlers', () => {
    for (const path of ['src/components/app-shell.tsx', 'src/app/(app)/dashboard/page.tsx']) {
      expect(read(path)).not.toMatch(/purchasing|openPoCount|getOpenPurchaseOrderCount/i);
    }
    for (const path of [
      'src/app/(app)/purchasing',
      'src/app/api/purchasing',
      'src/app/api/export/purchasing',
      'src/lib/actions/purchasing.ts',
    ]) {
      expect(existsSync(resolve(root, path))).toBe(false);
    }
    expect(read('src/lib/domain/rbac.ts')).not.toContain('purchasing:');
    expect(read('supabase/seed.sql')).not.toMatch(/public\.(suppliers|purchase_orders)/);
  });

  it('rejects new purchase receipts while accepting ordinary stock entries', () => {
    const input = {
      skuId: '00000000-0000-4000-8000-000000000001',
      locationId: '00000000-0000-4000-8000-000000000002',
      businessDate: '2026-10-29',
      quantity: 10,
    };
    expect(movementSchema.safeParse({ ...input, type: 'purchase_receipt' }).success).toBe(false);
    expect(movementSchema.safeParse({ ...input, type: 'production_output' }).success).toBe(true);
  });

  it('keeps historical receipt quantities in the ledger balance', () => {
    expect(
      balanceForSkuLocation(
        [
          { skuId: 'sku', locationId: 'warehouse', type: 'opening_balance', quantity: 20 },
          { skuId: 'sku', locationId: 'warehouse', type: 'purchase_receipt', quantity: 10 },
        ],
        'sku',
        'warehouse',
      ),
    ).toBe(30);
  });

  it('keeps Sales currencies and attachments independent of Purchasing', () => {
    expect(CURRENCIES).toEqual(['USD', 'KHR', 'CNY']);
    expect(isCurrency('USD')).toBe(true);
    expect(isCurrency('EUR')).toBe(false);
    expect(existsSync(resolve(root, 'src/components/attachment-field.tsx'))).toBe(true);
    expect(read('src/lib/domain/sales.ts')).toContain("from './currency'");
  });
});
