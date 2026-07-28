import { describe, it, expect } from 'vitest';
import {
  balanceForSkuLocation,
  toSignedQuantity,
  type MovementInput,
} from '@/lib/domain/stock-ledger';
import {
  computeSoStatus,
  computeOutstanding,
  evaluateOverDeliveryGuard,
  canDeliverAgainst,
} from '@/lib/domain/sales';

/**
 * End-to-end sales-order + delivery scenario, mirroring
 * tests/integration/purchasing-flows.test.ts's style. Uses the same pure
 * stock-ledger machinery as the real `post_sale_delivery` RPC (a
 * `sale_delivery` movement at the item's location, always stored negative),
 * so this proves the delivery flow's arithmetic without needing a live
 * database.
 */
const STORAGE = 'storage_room';
const WAREHOUSE = 'warehouse';
const MESH_9_NORMAL = 'mesh_9_normal';

interface SoItem {
  itemId: string;
  skuId: string;
  locationId: string;
  orderedQty: number;
}

function opening(skuId: string, locationId: string, qty: number): MovementInput {
  return {
    skuId,
    locationId,
    type: 'opening_balance',
    quantity: toSignedQuantity('opening_balance', qty),
  };
}

function delivery(item: SoItem, qty: number): MovementInput {
  return {
    skuId: item.skuId,
    locationId: item.locationId,
    type: 'sale_delivery',
    quantity: toSignedQuantity('sale_delivery', qty),
  };
}

describe('acceptance — creating a sales order (draft with line items)', () => {
  it('starts with zero delivered and the full amount outstanding', () => {
    const item: SoItem = {
      itemId: 'i1',
      skuId: MESH_9_NORMAL,
      locationId: STORAGE,
      orderedQty: 400,
    };
    expect(computeOutstanding(item.orderedQty, 0)).toBe(400);
    expect(computeSoStatus(item.orderedQty, 0)).toBe('partially_delivered');
  });
});

describe('acceptance — partial delivery', () => {
  it('updates outstanding and keeps the SO Partially Delivered, not Delivered', () => {
    const item: SoItem = {
      itemId: 'i1',
      skuId: MESH_9_NORMAL,
      locationId: STORAGE,
      orderedQty: 400,
    };
    const movements: MovementInput[] = [
      opening(item.skuId, item.locationId, 1000),
      delivery(item, 150),
    ];

    const delivered = 150;
    expect(computeOutstanding(item.orderedQty, delivered)).toBe(250);
    expect(computeSoStatus(item.orderedQty, delivered)).toBe('partially_delivered');
    expect(balanceForSkuLocation(movements, item.skuId, item.locationId)).toBe(850); // 1000 - 150
  });
});

describe('acceptance — full delivery', () => {
  it('marks the SO Delivered once total delivered reaches total ordered', () => {
    const item: SoItem = {
      itemId: 'i1',
      skuId: MESH_9_NORMAL,
      locationId: STORAGE,
      orderedQty: 400,
    };
    const movements: MovementInput[] = [
      opening(item.skuId, item.locationId, 1000),
      delivery(item, 150),
      delivery(item, 250),
    ];

    const delivered = 150 + 250;
    expect(computeOutstanding(item.orderedQty, delivered)).toBe(0);
    expect(computeSoStatus(item.orderedQty, delivered)).toBe('delivered');
    expect(balanceForSkuLocation(movements, item.skuId, item.locationId)).toBe(600); // 1000 - 400
  });
});

describe('acceptance — delivery decreases stock only at the selected location', () => {
  it('a Warehouse-bound SO item never touches the Storage Room balance, and vice versa', () => {
    const warehouseItem: SoItem = {
      itemId: 'i-wh',
      skuId: MESH_9_NORMAL,
      locationId: WAREHOUSE,
      orderedQty: 300,
    };
    const storageItem: SoItem = {
      itemId: 'i-st',
      skuId: MESH_9_NORMAL,
      locationId: STORAGE,
      orderedQty: 200,
    };
    const movements: MovementInput[] = [
      opening(MESH_9_NORMAL, WAREHOUSE, 300),
      opening(MESH_9_NORMAL, STORAGE, 200),
      delivery(warehouseItem, 300),
      delivery(storageItem, 50),
    ];

    expect(balanceForSkuLocation(movements, MESH_9_NORMAL, WAREHOUSE)).toBe(0);
    expect(balanceForSkuLocation(movements, MESH_9_NORMAL, STORAGE)).toBe(150);
  });
});

describe('acceptance — over-delivery is blocked without an Owner override', () => {
  it('rejects a delivery that would push delivered above ordered', () => {
    const item: SoItem = {
      itemId: 'i1',
      skuId: MESH_9_NORMAL,
      locationId: STORAGE,
      orderedQty: 400,
    };
    const alreadyDelivered = 350;
    const attempted = 100; // would total 450 > 400 ordered

    const guard = evaluateOverDeliveryGuard({
      orderedQty: item.orderedQty,
      alreadyDeliveredQty: alreadyDelivered,
      deltaQty: attempted,
      allowOverride: false,
    });
    expect(guard.ok).toBe(false);

    // An Owner overriding with a recorded reason is the only way through.
    const overridden = evaluateOverDeliveryGuard({
      orderedQty: item.orderedQty,
      alreadyDeliveredQty: alreadyDelivered,
      deltaQty: attempted,
      allowOverride: true,
      overrideReason: 'Owner approved extra units',
    });
    expect(overridden.ok).toBe(true);
  });
});

describe('acceptance — a cancelled SO cannot be delivered against', () => {
  it('canDeliverAgainst is false for cancelled (and draft), true for confirmed/partially_delivered', () => {
    expect(canDeliverAgainst('cancelled')).toBe(false);
    expect(canDeliverAgainst('draft')).toBe(false);
    expect(canDeliverAgainst('confirmed')).toBe(true);
    expect(canDeliverAgainst('partially_delivered')).toBe(true);
  });
});

describe('acceptance — transfer invariants still hold alongside sale deliveries', () => {
  it('a sale delivery at one location plus a transfer between locations keeps the company total correct', () => {
    const item: SoItem = {
      itemId: 'i1',
      skuId: MESH_9_NORMAL,
      locationId: STORAGE,
      orderedQty: 100,
    };
    const movements: MovementInput[] = [
      opening(MESH_9_NORMAL, STORAGE, 400),
      delivery(item, 100),
      {
        skuId: MESH_9_NORMAL,
        locationId: STORAGE,
        type: 'transfer_out',
        quantity: toSignedQuantity('transfer_out', 80),
      },
      {
        skuId: MESH_9_NORMAL,
        locationId: WAREHOUSE,
        type: 'transfer_in',
        quantity: toSignedQuantity('transfer_in', 80),
      },
    ];
    expect(balanceForSkuLocation(movements, MESH_9_NORMAL, STORAGE)).toBe(220); // 400 - 100 - 80
    expect(balanceForSkuLocation(movements, MESH_9_NORMAL, WAREHOUSE)).toBe(80);
    const companyTotal =
      balanceForSkuLocation(movements, MESH_9_NORMAL, STORAGE) +
      balanceForSkuLocation(movements, MESH_9_NORMAL, WAREHOUSE);
    expect(companyTotal).toBe(300); // 400 - 100 delivered, unchanged by the transfer
  });
});
