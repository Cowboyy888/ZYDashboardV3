import { describe, it, expect } from 'vitest';
import {
  balanceForSkuLocation,
  toSignedQuantity,
  type MovementInput,
} from '@/lib/domain/stock-ledger';
import {
  computePoStatus,
  computeOutstanding,
  evaluateOverReceiptGuard,
  canReceiveAgainst,
} from '@/lib/domain/purchasing';

/**
 * End-to-end purchase-order + goods-receiving scenario, mirroring
 * tests/integration/stock-flows.test.ts's style. Uses the same pure
 * stock-ledger machinery as the real `post_purchase_receipt` RPC (a
 * `purchase_receipt` movement at the item's location), so this proves the
 * receiving flow's arithmetic without needing a live database.
 */
const STORAGE = 'storage_room';
const WAREHOUSE = 'warehouse';
const MESH_9_NORMAL = 'mesh_9_normal';

interface PoItem {
  itemId: string;
  skuId: string;
  locationId: string;
  orderedQty: number;
}

function receipt(item: PoItem, qty: number): MovementInput {
  return {
    skuId: item.skuId,
    locationId: item.locationId,
    type: 'purchase_receipt',
    quantity: toSignedQuantity('purchase_receipt', qty),
  };
}

describe('acceptance — creating a purchase order (draft with line items)', () => {
  it('starts with zero received and the full amount outstanding', () => {
    const item: PoItem = {
      itemId: 'i1',
      skuId: MESH_9_NORMAL,
      locationId: STORAGE,
      orderedQty: 400,
    };
    expect(computeOutstanding(item.orderedQty, 0)).toBe(400);
    expect(computePoStatus(item.orderedQty, 0)).toBe('partially_received');
  });
});

describe('acceptance — partial receipt', () => {
  it('updates outstanding and keeps the PO Partially Received, not Received', () => {
    const item: PoItem = {
      itemId: 'i1',
      skuId: MESH_9_NORMAL,
      locationId: STORAGE,
      orderedQty: 400,
    };
    const movements: MovementInput[] = [receipt(item, 150)];

    const received = 150;
    expect(computeOutstanding(item.orderedQty, received)).toBe(250);
    expect(computePoStatus(item.orderedQty, received)).toBe('partially_received');
    expect(balanceForSkuLocation(movements, item.skuId, item.locationId)).toBe(150);
  });
});

describe('acceptance — full receipt', () => {
  it('marks the PO Received once total received reaches total ordered', () => {
    const item: PoItem = {
      itemId: 'i1',
      skuId: MESH_9_NORMAL,
      locationId: STORAGE,
      orderedQty: 400,
    };
    const movements: MovementInput[] = [receipt(item, 150), receipt(item, 250)];

    const received = 150 + 250;
    expect(computeOutstanding(item.orderedQty, received)).toBe(0);
    expect(computePoStatus(item.orderedQty, received)).toBe('received');
    expect(balanceForSkuLocation(movements, item.skuId, item.locationId)).toBe(400);
  });
});

describe('acceptance — receipt increases stock only at the selected location', () => {
  it('a Warehouse-bound PO item never touches the Storage Room balance, and vice versa', () => {
    const warehouseItem: PoItem = {
      itemId: 'i-wh',
      skuId: MESH_9_NORMAL,
      locationId: WAREHOUSE,
      orderedQty: 300,
    };
    const storageItem: PoItem = {
      itemId: 'i-st',
      skuId: MESH_9_NORMAL,
      locationId: STORAGE,
      orderedQty: 200,
    };
    const movements: MovementInput[] = [receipt(warehouseItem, 300), receipt(storageItem, 50)];

    expect(balanceForSkuLocation(movements, MESH_9_NORMAL, WAREHOUSE)).toBe(300);
    expect(balanceForSkuLocation(movements, MESH_9_NORMAL, STORAGE)).toBe(50);
  });
});

describe('acceptance — over-receipt is blocked without an Owner override', () => {
  it('rejects a receipt that would push received above ordered', () => {
    const item: PoItem = {
      itemId: 'i1',
      skuId: MESH_9_NORMAL,
      locationId: STORAGE,
      orderedQty: 400,
    };
    const alreadyReceived = 350;
    const attempted = 100; // would total 450 > 400 ordered

    const guard = evaluateOverReceiptGuard({
      orderedQty: item.orderedQty,
      alreadyReceivedQty: alreadyReceived,
      deltaQty: attempted,
      allowOverride: false,
    });
    expect(guard.ok).toBe(false);

    // An Owner overriding with a recorded reason is the only way through.
    const overridden = evaluateOverReceiptGuard({
      orderedQty: item.orderedQty,
      alreadyReceivedQty: alreadyReceived,
      deltaQty: attempted,
      allowOverride: true,
      overrideReason: 'Owner approved extra units',
    });
    expect(overridden.ok).toBe(true);
  });
});

describe('acceptance — a cancelled PO cannot receive stock', () => {
  it('canReceiveAgainst is false for cancelled (and draft), true for ordered/partially_received', () => {
    expect(canReceiveAgainst('cancelled')).toBe(false);
    expect(canReceiveAgainst('draft')).toBe(false);
    expect(canReceiveAgainst('ordered')).toBe(true);
    expect(canReceiveAgainst('partially_received')).toBe(true);
  });
});

describe('acceptance — transfer invariants still hold alongside purchase receipts', () => {
  it('a purchase receipt at one location plus a transfer between locations keeps the company total correct', () => {
    const item: PoItem = {
      itemId: 'i1',
      skuId: MESH_9_NORMAL,
      locationId: STORAGE,
      orderedQty: 200,
    };
    const movements: MovementInput[] = [
      receipt(item, 200),
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
    expect(balanceForSkuLocation(movements, MESH_9_NORMAL, STORAGE)).toBe(120);
    expect(balanceForSkuLocation(movements, MESH_9_NORMAL, WAREHOUSE)).toBe(80);
    const companyTotal =
      balanceForSkuLocation(movements, MESH_9_NORMAL, STORAGE) +
      balanceForSkuLocation(movements, MESH_9_NORMAL, WAREHOUSE);
    expect(companyTotal).toBe(200); // unchanged by the transfer
  });
});
