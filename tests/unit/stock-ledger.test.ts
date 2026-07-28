import { describe, it, expect } from 'vitest';
import {
  balanceForSkuLocation,
  companyBalanceForSku,
  buildTransferPair,
  toSignedQuantity,
  evaluateNegativeGuard,
  type MovementInput,
} from '@/lib/domain/stock-ledger';

const STORAGE = 'loc-storage';
const WAREHOUSE = 'loc-warehouse';
const SKU_A = 'sku-a';
const SKU_B = 'sku-b';

function opening(skuId: string, locationId: string, qty: number): MovementInput {
  return {
    skuId,
    locationId,
    type: 'opening_balance',
    quantity: toSignedQuantity('opening_balance', qty),
  };
}

describe('stock ledger — signed quantities', () => {
  it('inbound types are positive, outbound negative, adjustment signed', () => {
    expect(toSignedQuantity('purchase_receipt', 10)).toBe(10);
    expect(toSignedQuantity('production_output', 5)).toBe(5);
    expect(toSignedQuantity('sale_delivery', 3)).toBe(-3);
    expect(toSignedQuantity('other_stock_out', 2)).toBe(-2);
    expect(toSignedQuantity('adjustment', -4)).toBe(-4);
    expect(toSignedQuantity('adjustment', 4)).toBe(4);
  });

  it('supports decimal 捆 quantities without float noise', () => {
    const movements = [opening(SKU_A, STORAGE, 30.5), opening(SKU_A, STORAGE, 0.1)];
    expect(balanceForSkuLocation(movements, SKU_A, STORAGE)).toBe(30.6);
  });
});

describe('acceptance #2 — receive purchased stock into Storage Room', () => {
  it('increases only the received SKU + location', () => {
    const movements: MovementInput[] = [
      opening(SKU_A, STORAGE, 100),
      {
        skuId: SKU_A,
        locationId: STORAGE,
        type: 'purchase_receipt',
        quantity: toSignedQuantity('purchase_receipt', 25),
      },
    ];
    expect(balanceForSkuLocation(movements, SKU_A, STORAGE)).toBe(125);
    expect(balanceForSkuLocation(movements, SKU_A, WAREHOUSE)).toBe(0);
    expect(balanceForSkuLocation(movements, SKU_B, STORAGE)).toBe(0);
  });
});

describe('acceptance #3 — transfer Storage Room -> Warehouse keeps company total', () => {
  it('creates matching out/in and preserves company balance', () => {
    const base: MovementInput[] = [opening(SKU_A, STORAGE, 329)];
    const companyBefore = companyBalanceForSku(base, SKU_A);

    const pair = buildTransferPair({
      skuId: SKU_A,
      fromLocationId: STORAGE,
      toLocationId: WAREHOUSE,
      quantity: 100,
      transferGroupId: 'grp-1',
    });
    const after = [...base, ...pair];

    expect(balanceForSkuLocation(after, SKU_A, STORAGE)).toBe(229);
    expect(balanceForSkuLocation(after, SKU_A, WAREHOUSE)).toBe(100);
    expect(companyBalanceForSku(after, SKU_A)).toBe(companyBefore); // invariant
    expect(companyBalanceForSku(after, SKU_A)).toBe(329);
  });

  it('rejects a transfer to the same location', () => {
    expect(() =>
      buildTransferPair({
        skuId: SKU_A,
        fromLocationId: STORAGE,
        toLocationId: STORAGE,
        quantity: 5,
        transferGroupId: 'grp-x',
      }),
    ).toThrow();
  });
});

describe('acceptance #4 — production increases only the selected SKU', () => {
  it('adds production_output to one SKU/location only', () => {
    const movements: MovementInput[] = [
      opening(SKU_A, WAREHOUSE, 903),
      opening(SKU_B, WAREHOUSE, 146),
      {
        skuId: SKU_A,
        locationId: WAREHOUSE,
        type: 'production_output',
        quantity: toSignedQuantity('production_output', 50),
      },
    ];
    expect(balanceForSkuLocation(movements, SKU_A, WAREHOUSE)).toBe(953);
    expect(balanceForSkuLocation(movements, SKU_B, WAREHOUSE)).toBe(146); // untouched
  });
});

describe('acceptance #5 — confirmed sale delivery decreases only correct SKU + location', () => {
  it('reduces the delivering location only', () => {
    const movements: MovementInput[] = [
      opening(SKU_A, STORAGE, 200),
      opening(SKU_A, WAREHOUSE, 200),
      {
        skuId: SKU_A,
        locationId: WAREHOUSE,
        type: 'sale_delivery',
        quantity: toSignedQuantity('sale_delivery', 30),
      },
    ];
    expect(balanceForSkuLocation(movements, SKU_A, WAREHOUSE)).toBe(170);
    expect(balanceForSkuLocation(movements, SKU_A, STORAGE)).toBe(200); // other location untouched
    expect(companyBalanceForSku(movements, SKU_A)).toBe(370);
  });
});

describe('acceptance #6 — negative stock is blocked without Owner override', () => {
  it('blocks a movement that would go negative', () => {
    const result = evaluateNegativeGuard({
      currentBalance: 10,
      delta: -15,
      allowOverride: false,
    });
    expect(result.ok).toBe(false);
    expect(result.blocked).toBe(true);
    expect(result.resultingBalance).toBe(-5);
  });

  it('allows an Owner override with a recorded reason', () => {
    const result = evaluateNegativeGuard({
      currentBalance: 10,
      delta: -15,
      allowOverride: true,
      overrideReason: 'Physical count correction, approved by owner',
    });
    expect(result.ok).toBe(true);
    expect(result.blocked).toBe(false);
    expect(result.reason).toContain('Owner override');
  });

  it('rejects an override with no reason', () => {
    const result = evaluateNegativeGuard({
      currentBalance: 0,
      delta: -1,
      allowOverride: true,
      overrideReason: '   ',
    });
    expect(result.ok).toBe(false);
  });
});
