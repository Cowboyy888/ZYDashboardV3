import { calculateWireMesh, type WireMeshInput } from './wire-mesh';

export const PRODUCTION_STATUSES = ['draft', 'approved', 'on_hold', 'cancelled'] as const;
export type ProductionStatus = (typeof PRODUCTION_STATUSES)[number];
export const PRODUCTION_PRIORITIES = ['normal', 'high', 'urgent'] as const;

export interface ProductionGeometry extends Omit<WireMeshInput, 'quantity'> {
  wireDiameterMm: number;
  meshSpecification: string;
}

export function productionCalculation(geometry: ProductionGeometry, quantity: number) {
  return calculateWireMesh({ ...geometry, quantity });
}

export function productionTransitions(
  status: ProductionStatus,
  heldFrom: ProductionStatus | null,
): ProductionStatus[] {
  switch (status) {
    case 'draft':
      return ['approved', 'on_hold', 'cancelled'];
    case 'approved':
      return ['on_hold', 'cancelled'];
    case 'on_hold':
      return [heldFrom === 'approved' ? 'approved' : 'draft', 'cancelled'];
    case 'cancelled':
      return [];
  }
}

export function productionOverdue(status: ProductionStatus, dueDate: string, today: string) {
  return status !== 'cancelled' && dueDate < today;
}

export type ProductionReferenceKind = 'sales_items' | 'skus' | 'drawings' | 'supervisors';
export interface ProductionReference {
  id: string;
  label: string;
  sku_id?: string;
  sku_label?: string;
}

export interface ProductionOrderRow {
  id: string;
  order_number: string;
  business_date: string;
  sales_order_item_id: string | null;
  sales_order_id: string | null;
  sales_order_number: string | null;
  customer_reference: string | null;
  internal_reason: string | null;
  sku_id: string;
  sku_label: string;
  drawing_id: string;
  geometry: ProductionGeometry;
  planned_quantity: number;
  required_date: string;
  priority: (typeof PRODUCTION_PRIORITIES)[number];
  planned_line: string | null;
  supervisor_id: string | null;
  supervisor_name: string | null;
  notes: string | null;
  attachment_path: string | null;
  status: ProductionStatus;
  held_from_status: ProductionStatus | null;
  status_reason: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_by: string;
  updated_by: string;
  version: number;
  created_at: string;
  updated_at: string;
}
