import { describe, expect, it } from 'vitest';
import {
  productionCalculation,
  productionOverdue,
  productionTransitions,
  type ProductionGeometry,
} from '@/lib/domain/production-orders';
import { productionOrderSchema, productionTransitionSchema } from '@/lib/validation/schemas';
import { ROLES, hasPermission } from '@/lib/domain/rbac';
import { translator, localizeMessage } from '@/lib/i18n';

const geometry: ProductionGeometry = {
  wireDiameterMm: 5.5,
  meshSpecification: 'Mesh',
  sheetLengthMm: 6000,
  sheetWidthMm: 2400,
  lengthSpacingMm: 200,
  widthSpacingMm: 200,
  overhangLeftMm: 0,
  overhangRightMm: 0,
  overhangTopMm: 0,
  overhangBottomMm: 0,
};
const input = {
  id: '11111111-1111-4111-8111-111111111111',
  version: 0,
  businessDate: '2026-10-30',
  salesOrderItemId: null,
  internalReason: 'Low finished stock',
  skuId: '22222222-2222-4222-8222-222222222222',
  drawingId: '33333333-3333-4333-8333-333333333333',
  plannedQuantity: 10,
  requiredDate: '2026-11-04',
  priority: 'normal',
};

describe('P4.1 production planning contract', () => {
  it('reuses exact drawing geometry for wire counts and planned area', () => {
    expect(productionCalculation(geometry, 10)).toMatchObject({
      errors: [],
      lengthWireCount: 31,
      widthWireCount: 13,
      totalAreaM2: 144,
    });
    expect(productionCalculation({ ...geometry, lengthSpacingMm: 250 }, 10).errors).toHaveLength(0);
    expect(
      productionCalculation({ ...geometry, lengthSpacingMm: 260 }, 10).errors,
    ).not.toHaveLength(0);
  });
  it('has only planning transitions, restores the held state, and keeps cancellation terminal', () => {
    expect(productionTransitions('draft', null)).toEqual(['approved', 'on_hold', 'cancelled']);
    expect(productionTransitions('approved', null)).toEqual(['on_hold', 'cancelled']);
    expect(productionTransitions('on_hold', 'approved')).toEqual(['approved', 'cancelled']);
    expect(productionTransitions('on_hold', 'draft')).toEqual(['draft', 'cancelled']);
    expect(productionTransitions('cancelled', null)).toEqual([]);
  });
  it('validates whole sheets, source intent, and reasons without exposing an output-posting path', () => {
    expect(productionOrderSchema.safeParse(input).success).toBe(true);
    expect(productionOrderSchema.safeParse({ ...input, internalReason: '' }).success).toBe(false);
    for (const plannedQuantity of [0, -1, 1.5, Infinity])
      expect(productionOrderSchema.safeParse({ ...input, plannedQuantity }).success).toBe(false);
    expect(
      productionTransitionSchema.safeParse({
        id: input.id,
        version: 1,
        status: 'cancelled',
        reason: '',
      }).success,
    ).toBe(false);
    expect(
      productionTransitionSchema.safeParse({ id: input.id, version: 1, status: 'completed' })
        .success,
    ).toBe(false);
  });
  it('derives overdue from the Bangkok business date and excludes cancelled plans', () => {
    expect(productionOverdue('draft', '2026-10-29', '2026-10-30')).toBe(true);
    expect(productionOverdue('approved', '2026-10-30', '2026-10-30')).toBe(false);
    expect(productionOverdue('cancelled', '2026-10-29', '2026-10-30')).toBe(false);
  });
  it('grants factory management conservatively while approval remains Owner-only', () => {
    for (const role of ROLES) {
      expect(hasPermission(role, 'production:view')).toBe(
        ['owner', 'system_admin', 'warehouse_admin', 'sales_admin'].includes(role),
      );
      expect(hasPermission(role, 'production:manage')).toBe(
        ['owner', 'warehouse_admin'].includes(role),
      );
      expect(hasPermission(role, 'production:approve')).toBe(role === 'owner');
    }
  });
  it('provides translated labels and production errors', () => {
    expect(translator('zh')('production.status.on_hold')).toBe('暂停');
    expect(localizeMessage('zh', 'Only the Owner can approve production.')).not.toBe(
      'Only the Owner can approve production.',
    );
  });
});
