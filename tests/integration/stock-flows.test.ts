import { describe, it, expect } from 'vitest';
import {
  balanceForSkuLocation,
  companyBalanceForSku,
  companyGrandTotal,
  balancesBySkuLocation,
  buildTransferPair,
  toSignedQuantity,
  type MovementInput,
} from '@/lib/domain/stock-ledger';

/**
 * End-to-end ledger scenario mirroring the seeded opening stock, then a mix of
 * production, sale, transfer and stock-out. Verifies the Storage Room /
 * Warehouse / combined company views stay consistent and that transfers never
 * change the company total.
 */
const STORAGE = 'storage_room';
const WAREHOUSE = 'warehouse';

// Seeded example SKUs (subset).
const WIRE_10 = 'batsi_10'; // 拔丝料 10厘 (捆)
const WIRE_6 = 'batsi_6'; // 拔丝料 6厘 (捆)
const MESH_9_NORMAL = 'mesh_9_normal'; // 钢筋网 9厘|3×6|20孔|Normal (张)
const MESH_9_OLD = 'mesh_9_old'; // 钢筋网 9厘|3×6|20孔|旧 (张)

function mv(
  skuId: string,
  locationId: string,
  type: MovementInput['type'],
  magnitude: number,
): MovementInput {
  return { skuId, locationId, type, quantity: toSignedQuantity(type, magnitude) };
}

function seed(): MovementInput[] {
  return [
    mv(WIRE_10, STORAGE, 'opening_balance', 10),
    mv(WIRE_6, STORAGE, 'opening_balance', 30.5),
    mv(MESH_9_NORMAL, STORAGE, 'opening_balance', 329),
    mv(MESH_9_OLD, STORAGE, 'opening_balance', 64),
  ];
}

describe('integration — seeded opening balances', () => {
  it('reflects opening stock exactly, including decimals', () => {
    const m = seed();
    expect(balanceForSkuLocation(m, WIRE_6, STORAGE)).toBe(30.5);
    expect(balanceForSkuLocation(m, MESH_9_NORMAL, STORAGE)).toBe(329);
    expect(companyGrandTotal(m)).toBe(10 + 30.5 + 329 + 64);
  });
});

describe('integration — production then partial transfer then sale', () => {
  it('keeps company total invariant through the transfer and correct after sale', () => {
    const m = seed();

    // Produce 100 张 of MESH_9_NORMAL into Warehouse.
    m.push(mv(MESH_9_NORMAL, WAREHOUSE, 'production_output', 100));
    expect(companyBalanceForSku(m, MESH_9_NORMAL)).toBe(429);

    // Transfer 50 张 Storage -> Warehouse.
    const companyBeforeTransfer = companyBalanceForSku(m, MESH_9_NORMAL);
    m.push(
      ...buildTransferPair({
        skuId: MESH_9_NORMAL,
        fromLocationId: STORAGE,
        toLocationId: WAREHOUSE,
        quantity: 50,
        transferGroupId: 'grp-int-1',
      }),
    );
    expect(companyBalanceForSku(m, MESH_9_NORMAL)).toBe(companyBeforeTransfer); // invariant
    expect(balanceForSkuLocation(m, MESH_9_NORMAL, STORAGE)).toBe(279);
    expect(balanceForSkuLocation(m, MESH_9_NORMAL, WAREHOUSE)).toBe(150);

    // Confirmed sale delivery of 40 张 from Warehouse.
    m.push(mv(MESH_9_NORMAL, WAREHOUSE, 'sale_delivery', 40));
    expect(balanceForSkuLocation(m, MESH_9_NORMAL, WAREHOUSE)).toBe(110);
    expect(balanceForSkuLocation(m, MESH_9_NORMAL, STORAGE)).toBe(279); // untouched
    expect(companyBalanceForSku(m, MESH_9_NORMAL)).toBe(389);

    // Other SKUs entirely untouched by all of the above.
    expect(balanceForSkuLocation(m, MESH_9_OLD, STORAGE)).toBe(64);
    expect(balanceForSkuLocation(m, WIRE_10, STORAGE)).toBe(10);
  });
});

describe('integration — combined stock views', () => {
  it('produces per-location balances that sum to the company total', () => {
    const m = seed();
    m.push(
      ...buildTransferPair({
        skuId: MESH_9_NORMAL,
        fromLocationId: STORAGE,
        toLocationId: WAREHOUSE,
        quantity: 129,
        transferGroupId: 'grp-int-2',
      }),
    );
    const balances = balancesBySkuLocation(m).filter((b) => b.skuId === MESH_9_NORMAL);
    const sum = balances.reduce((acc, b) => acc + b.quantity, 0);
    expect(sum).toBe(companyBalanceForSku(m, MESH_9_NORMAL));
    expect(sum).toBe(329);
  });
});
