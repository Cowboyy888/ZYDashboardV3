import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type {
  AttendanceGroupRow,
  AttendanceRow,
  AuditLogRow,
  CustomerRow,
  EmployeeRow,
  EmployeePrivateRow,
  LocationRow,
  PayrollItemDeductionsRow,
  PayrollItemLineRow,
  PayrollItemRow,
  PayrollRunRow,
  ProductFamilyRow,
  ProfileRow,
  PurchaseOrderItemReceivedRow,
  PurchaseOrderItemRow,
  PurchaseOrderRow,
  SalesOrderItemDeliveredRow,
  SalesOrderItemRow,
  SalesOrderRow,
  SkuRow,
  StockMovementRow,
  SupplierRow,
  TelegramSettingsRow,
} from './types';

/**
 * Read helpers used by pages/actions. Each swallows errors into an empty result
 * and logs, so a not-yet-configured database degrades gracefully rather than
 * throwing during render. RLS still governs what each user can actually read.
 */
async function client() {
  return createSupabaseServerClient();
}

export async function getLocations(includeArchived = false): Promise<LocationRow[]> {
  try {
    const supabase = await client();
    let q = supabase.from('locations').select('*').order('name');
    if (!includeArchived) q = q.eq('is_active', true);
    const { data } = await q;
    return (data as LocationRow[]) ?? [];
  } catch (e) {
    console.error('[queries] getLocations', e);
    return [];
  }
}

export async function getFamilies(includeArchived = false): Promise<ProductFamilyRow[]> {
  try {
    const supabase = await client();
    let q = supabase.from('product_families').select('*').order('name');
    if (!includeArchived) q = q.eq('is_active', true);
    const { data } = await q;
    return (data as ProductFamilyRow[]) ?? [];
  } catch (e) {
    console.error('[queries] getFamilies', e);
    return [];
  }
}

export async function getSkus(includeArchived = false): Promise<SkuRow[]> {
  try {
    const supabase = await client();
    let q = supabase.from('skus').select('*').order('created_at');
    if (!includeArchived) q = q.eq('is_active', true);
    const { data } = await q;
    return (data as SkuRow[]) ?? [];
  } catch (e) {
    console.error('[queries] getSkus', e);
    return [];
  }
}

export interface BalanceRow {
  sku_id: string;
  location_id: string;
  quantity: number;
}

export async function getBalances(): Promise<BalanceRow[]> {
  try {
    const supabase = await client();
    const { data } = await supabase.from('stock_balances').select('*');
    return (data as BalanceRow[]) ?? [];
  } catch (e) {
    console.error('[queries] getBalances', e);
    return [];
  }
}

export async function getRecentMovements(limit = 50): Promise<StockMovementRow[]> {
  try {
    const supabase = await client();
    const { data } = await supabase
      .from('stock_movements')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    return (data as StockMovementRow[]) ?? [];
  } catch (e) {
    console.error('[queries] getRecentMovements', e);
    return [];
  }
}

export async function getAttendanceGroups(includeArchived = false): Promise<AttendanceGroupRow[]> {
  try {
    const supabase = await client();
    let q = supabase.from('attendance_groups').select('*').order('sort_order').order('name');
    if (!includeArchived) q = q.eq('is_active', true);
    const { data } = await q;
    return (data as AttendanceGroupRow[]) ?? [];
  } catch (e) {
    console.error('[queries] getAttendanceGroups', e);
    return [];
  }
}

export async function getEmployees(includeInactive = false): Promise<EmployeeRow[]> {
  try {
    const supabase = await client();
    let q = supabase.from('employees').select('*').order('employee_code');
    if (!includeInactive) q = q.eq('is_active', true);
    const { data } = await q;
    return (data as EmployeeRow[]) ?? [];
  } catch (e) {
    console.error('[queries] getEmployees', e);
    return [];
  }
}

export async function getEmployee(id: string): Promise<EmployeeRow | null> {
  try {
    const supabase = await client();
    const { data } = await supabase.from('employees').select('*').eq('id', id).maybeSingle();
    return (data as EmployeeRow) ?? null;
  } catch (e) {
    console.error('[queries] getEmployee', e);
    return null;
  }
}

/** Sensitive payroll row. RLS returns null unless the caller is permitted. */
export async function getEmployeePrivate(employeeId: string): Promise<EmployeePrivateRow | null> {
  try {
    const supabase = await client();
    const { data } = await supabase
      .from('employee_private')
      .select('*')
      .eq('employee_id', employeeId)
      .maybeSingle();
    return (data as EmployeePrivateRow) ?? null;
  } catch (e) {
    console.error('[queries] getEmployeePrivate', e);
    return null;
  }
}

/** All sensitive payroll rows (for the Employees list's rate column). RLS returns none unless permitted. */
export async function getAllEmployeePrivate(): Promise<EmployeePrivateRow[]> {
  try {
    const supabase = await client();
    const { data } = await supabase.from('employee_private').select('*');
    return (data as EmployeePrivateRow[]) ?? [];
  } catch (e) {
    console.error('[queries] getAllEmployeePrivate', e);
    return [];
  }
}

/** Short-lived signed URL for a private employee photo (RLS still applies). */
export async function getSignedPhotoUrl(path: string | null): Promise<string | null> {
  if (!path) return null;
  try {
    const supabase = await client();
    const { data } = await supabase.storage.from('employee-photos').createSignedUrl(path, 120);
    return data?.signedUrl ?? null;
  } catch (e) {
    console.error('[queries] getSignedPhotoUrl', e);
    return null;
  }
}

export async function getAttendanceForDate(businessDate: string): Promise<AttendanceRow[]> {
  try {
    const supabase = await client();
    const { data } = await supabase
      .from('attendance')
      .select('*')
      .eq('business_date', businessDate);
    return (data as AttendanceRow[]) ?? [];
  } catch (e) {
    console.error('[queries] getAttendanceForDate', e);
    return [];
  }
}

export async function getAttendanceRange(from: string, to: string): Promise<AttendanceRow[]> {
  try {
    const supabase = await client();
    const { data } = await supabase
      .from('attendance')
      .select('*')
      .gte('business_date', from)
      .lte('business_date', to);
    return (data as AttendanceRow[]) ?? [];
  } catch (e) {
    console.error('[queries] getAttendanceRange', e);
    return [];
  }
}

export async function getProductionCountForDate(businessDate: string): Promise<number> {
  try {
    const supabase = await client();
    const { data } = await supabase
      .from('stock_movements')
      .select('quantity')
      .eq('type', 'production_output')
      .eq('business_date', businessDate);
    return (
      (data as { quantity: number }[] | null)?.reduce((s, m) => s + Number(m.quantity), 0) ?? 0
    );
  } catch (e) {
    console.error('[queries] getProductionCountForDate', e);
    return 0;
  }
}

export async function getTelegramSettings(): Promise<TelegramSettingsRow | null> {
  try {
    const supabase = await client();
    const { data } = await supabase.from('telegram_settings').select('*').eq('id', 1).maybeSingle();
    return (data as TelegramSettingsRow) ?? null;
  } catch (e) {
    console.error('[queries] getTelegramSettings', e);
    return null;
  }
}

/** Whether an Owner account already exists (drives the setup/bootstrap gate). */
export async function getOwnerExists(): Promise<boolean> {
  try {
    const supabase = await client();
    const { data } = await supabase.rpc('owner_exists');
    return data === true;
  } catch (e) {
    console.error('[queries] getOwnerExists', e);
    return false;
  }
}

export async function getProfiles(): Promise<ProfileRow[]> {
  try {
    const supabase = await client();
    const { data } = await supabase.from('profiles').select('*').order('created_at');
    return (data as ProfileRow[]) ?? [];
  } catch (e) {
    console.error('[queries] getProfiles', e);
    return [];
  }
}

export async function getAuditLog(limit = 100): Promise<AuditLogRow[]> {
  try {
    const supabase = await client();
    const { data } = await supabase
      .from('audit_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    return (data as AuditLogRow[]) ?? [];
  } catch (e) {
    console.error('[queries] getAuditLog', e);
    return [];
  }
}

// --- Purchasing (Second pass) -------------------------------------------------

export async function getSuppliers(includeArchived = false): Promise<SupplierRow[]> {
  try {
    const supabase = await client();
    let q = supabase.from('suppliers').select('*').order('name');
    if (!includeArchived) q = q.eq('is_active', true);
    const { data } = await q;
    return (data as SupplierRow[]) ?? [];
  } catch (e) {
    console.error('[queries] getSuppliers', e);
    return [];
  }
}

export async function getSupplier(id: string): Promise<SupplierRow | null> {
  try {
    const supabase = await client();
    const { data } = await supabase.from('suppliers').select('*').eq('id', id).maybeSingle();
    return (data as SupplierRow) ?? null;
  } catch (e) {
    console.error('[queries] getSupplier', e);
    return null;
  }
}

/** Count-only (no row data transferred) — for the dashboard's "Open POs" tile. */
export async function getOpenPurchaseOrderCount(): Promise<number> {
  try {
    const supabase = await client();
    const { count } = await supabase
      .from('purchase_orders')
      .select('id', { count: 'exact', head: true })
      .in('status', ['ordered', 'partially_received']);
    return count ?? 0;
  } catch (e) {
    console.error('[queries] getOpenPurchaseOrderCount', e);
    return 0;
  }
}

export async function getPurchaseOrders(): Promise<PurchaseOrderRow[]> {
  try {
    const supabase = await client();
    const { data } = await supabase
      .from('purchase_orders')
      .select('*')
      .order('created_at', { ascending: false });
    return (data as PurchaseOrderRow[]) ?? [];
  } catch (e) {
    console.error('[queries] getPurchaseOrders', e);
    return [];
  }
}

export async function getPurchaseOrder(id: string): Promise<PurchaseOrderRow | null> {
  try {
    const supabase = await client();
    const { data } = await supabase.from('purchase_orders').select('*').eq('id', id).maybeSingle();
    return (data as PurchaseOrderRow) ?? null;
  } catch (e) {
    console.error('[queries] getPurchaseOrder', e);
    return null;
  }
}

export async function getPurchaseOrderItems(
  purchaseOrderId?: string,
): Promise<PurchaseOrderItemRow[]> {
  try {
    const supabase = await client();
    let q = supabase.from('purchase_order_items').select('*').order('created_at');
    if (purchaseOrderId) q = q.eq('purchase_order_id', purchaseOrderId);
    const { data } = await q;
    return (data as PurchaseOrderItemRow[]) ?? [];
  } catch (e) {
    console.error('[queries] getPurchaseOrderItems', e);
    return [];
  }
}

/**
 * `purchase_order_item_received` aggregates (sums) over the whole
 * `stock_movements` ledger per item — pass `itemIds` (a single PO's item ids)
 * whenever the caller only needs one order, so the DB filters before
 * aggregating instead of scanning every receipt ever recorded company-wide.
 * Callers that genuinely need every order (the PO list, exports) omit it.
 */
export async function getPurchaseOrderItemsReceived(
  itemIds?: string[],
): Promise<PurchaseOrderItemReceivedRow[]> {
  if (itemIds && itemIds.length === 0) return [];
  try {
    const supabase = await client();
    let q = supabase.from('purchase_order_item_received').select('*');
    if (itemIds) q = q.in('item_id', itemIds);
    const { data } = await q;
    return (data as PurchaseOrderItemReceivedRow[]) ?? [];
  } catch (e) {
    console.error('[queries] getPurchaseOrderItemsReceived', e);
    return [];
  }
}

/** Receipt history (stock_movements) for one PO item — the receiving audit trail. */
export async function getPurchaseOrderItemReceipts(itemId: string): Promise<StockMovementRow[]> {
  try {
    const supabase = await client();
    const { data } = await supabase
      .from('stock_movements')
      .select('*')
      .eq('purchase_order_item_id', itemId)
      .eq('type', 'purchase_receipt')
      .order('created_at', { ascending: false });
    return (data as StockMovementRow[]) ?? [];
  } catch (e) {
    console.error('[queries] getPurchaseOrderItemReceipts', e);
    return [];
  }
}

/** All receipts across every item of one PO — for the detail page's receipt history. */
export async function getPurchaseOrderReceipts(itemIds: string[]): Promise<StockMovementRow[]> {
  if (itemIds.length === 0) return [];
  try {
    const supabase = await client();
    const { data } = await supabase
      .from('stock_movements')
      .select('*')
      .in('purchase_order_item_id', itemIds)
      .eq('type', 'purchase_receipt')
      .order('created_at', { ascending: false });
    return (data as StockMovementRow[]) ?? [];
  } catch (e) {
    console.error('[queries] getPurchaseOrderReceipts', e);
    return [];
  }
}

// --- Sales (Third pass) --------------------------------------------------------

export async function getCustomers(includeArchived = false): Promise<CustomerRow[]> {
  try {
    const supabase = await client();
    let q = supabase.from('customers').select('*').order('name');
    if (!includeArchived) q = q.eq('is_active', true);
    const { data } = await q;
    return (data as CustomerRow[]) ?? [];
  } catch (e) {
    console.error('[queries] getCustomers', e);
    return [];
  }
}

export async function getCustomer(id: string): Promise<CustomerRow | null> {
  try {
    const supabase = await client();
    const { data } = await supabase.from('customers').select('*').eq('id', id).maybeSingle();
    return (data as CustomerRow) ?? null;
  } catch (e) {
    console.error('[queries] getCustomer', e);
    return null;
  }
}

/** Count-only (no row data transferred) — for the dashboard's "Sales today" tile. */
export async function getSalesOrderTodayCount(businessDate: string): Promise<number> {
  try {
    const supabase = await client();
    const { count } = await supabase
      .from('sales_orders')
      .select('id', { count: 'exact', head: true })
      .eq('order_date', businessDate)
      .neq('status', 'cancelled');
    return count ?? 0;
  } catch (e) {
    console.error('[queries] getSalesOrderTodayCount', e);
    return 0;
  }
}

/** Count-only (no row data transferred) — for the dashboard's "Pending deliveries" tile. */
export async function getPendingDeliveryOrderCount(): Promise<number> {
  try {
    const supabase = await client();
    const { count } = await supabase
      .from('sales_orders')
      .select('id', { count: 'exact', head: true })
      .in('status', ['confirmed', 'partially_delivered']);
    return count ?? 0;
  } catch (e) {
    console.error('[queries] getPendingDeliveryOrderCount', e);
    return 0;
  }
}

export async function getSalesOrders(): Promise<SalesOrderRow[]> {
  try {
    const supabase = await client();
    const { data } = await supabase
      .from('sales_orders')
      .select('*')
      .order('created_at', { ascending: false });
    return (data as SalesOrderRow[]) ?? [];
  } catch (e) {
    console.error('[queries] getSalesOrders', e);
    return [];
  }
}

export async function getSalesOrder(id: string): Promise<SalesOrderRow | null> {
  try {
    const supabase = await client();
    const { data } = await supabase.from('sales_orders').select('*').eq('id', id).maybeSingle();
    return (data as SalesOrderRow) ?? null;
  } catch (e) {
    console.error('[queries] getSalesOrder', e);
    return null;
  }
}

export async function getSalesOrderItems(salesOrderId?: string): Promise<SalesOrderItemRow[]> {
  try {
    const supabase = await client();
    let q = supabase.from('sales_order_items').select('*').order('created_at');
    if (salesOrderId) q = q.eq('sales_order_id', salesOrderId);
    const { data } = await q;
    return (data as SalesOrderItemRow[]) ?? [];
  } catch (e) {
    console.error('[queries] getSalesOrderItems', e);
    return [];
  }
}

/**
 * `sales_order_item_delivered` aggregates (sums) over the whole
 * `stock_movements` ledger per item — pass `itemIds` (a single SO's item ids)
 * whenever the caller only needs one order, so the DB filters before
 * aggregating instead of scanning every delivery ever recorded company-wide.
 * Callers that genuinely need every order (the SO list, exports) omit it.
 */
export async function getSalesOrderItemsDelivered(
  itemIds?: string[],
): Promise<SalesOrderItemDeliveredRow[]> {
  if (itemIds && itemIds.length === 0) return [];
  try {
    const supabase = await client();
    let q = supabase.from('sales_order_item_delivered').select('*');
    if (itemIds) q = q.in('item_id', itemIds);
    const { data } = await q;
    return (data as SalesOrderItemDeliveredRow[]) ?? [];
  } catch (e) {
    console.error('[queries] getSalesOrderItemsDelivered', e);
    return [];
  }
}

/** Delivery history (stock_movements) for one SO item — the delivery audit trail. */
export async function getSalesOrderItemDeliveries(itemId: string): Promise<StockMovementRow[]> {
  try {
    const supabase = await client();
    const { data } = await supabase
      .from('stock_movements')
      .select('*')
      .eq('sales_order_item_id', itemId)
      .eq('type', 'sale_delivery')
      .order('created_at', { ascending: false });
    return (data as StockMovementRow[]) ?? [];
  } catch (e) {
    console.error('[queries] getSalesOrderItemDeliveries', e);
    return [];
  }
}

/** All deliveries across every item of one SO — for the detail page's delivery history. */
export async function getSalesOrderDeliveries(itemIds: string[]): Promise<StockMovementRow[]> {
  if (itemIds.length === 0) return [];
  try {
    const supabase = await client();
    const { data } = await supabase
      .from('stock_movements')
      .select('*')
      .in('sales_order_item_id', itemIds)
      .eq('type', 'sale_delivery')
      .order('created_at', { ascending: false });
    return (data as StockMovementRow[]) ?? [];
  } catch (e) {
    console.error('[queries] getSalesOrderDeliveries', e);
    return [];
  }
}

// --- Payroll (Fourth pass) ------------------------------------------------------

/** Count-only (no row data transferred) — for the dashboard's "Payroll approvals" tile. */
export async function getDraftPayrollRunCount(): Promise<number> {
  try {
    const supabase = await client();
    const { count } = await supabase
      .from('payroll_runs')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'draft');
    return count ?? 0;
  } catch (e) {
    console.error('[queries] getDraftPayrollRunCount', e);
    return 0;
  }
}

export async function getPayrollRuns(): Promise<PayrollRunRow[]> {
  try {
    const supabase = await client();
    const { data } = await supabase
      .from('payroll_runs')
      .select('*')
      .order('created_at', { ascending: false });
    return (data as PayrollRunRow[]) ?? [];
  } catch (e) {
    console.error('[queries] getPayrollRuns', e);
    return [];
  }
}

export async function getPayrollRun(id: string): Promise<PayrollRunRow | null> {
  try {
    const supabase = await client();
    const { data } = await supabase.from('payroll_runs').select('*').eq('id', id).maybeSingle();
    return (data as PayrollRunRow) ?? null;
  } catch (e) {
    console.error('[queries] getPayrollRun', e);
    return null;
  }
}

export async function getPayrollItems(payrollRunId?: string): Promise<PayrollItemRow[]> {
  try {
    const supabase = await client();
    let q = supabase.from('payroll_items').select('*').order('created_at');
    if (payrollRunId) q = q.eq('payroll_run_id', payrollRunId);
    const { data } = await q;
    return (data as PayrollItemRow[]) ?? [];
  } catch (e) {
    console.error('[queries] getPayrollItems', e);
    return [];
  }
}

/**
 * `payroll_item_deductions` aggregates (sums) over the whole
 * `payroll_item_lines` table per item — pass `itemIds` (a single run's item
 * ids) whenever the caller only needs one run, so the DB filters before
 * aggregating instead of scanning every deduction/advance line ever recorded
 * company-wide. Callers that genuinely need every run (the runs list, the
 * payroll export) omit it.
 */
export async function getPayrollItemDeductions(
  itemIds?: string[],
): Promise<PayrollItemDeductionsRow[]> {
  if (itemIds && itemIds.length === 0) return [];
  try {
    const supabase = await client();
    let q = supabase.from('payroll_item_deductions').select('*');
    if (itemIds) q = q.in('item_id', itemIds);
    const { data } = await q;
    return (data as PayrollItemDeductionsRow[]) ?? [];
  } catch (e) {
    console.error('[queries] getPayrollItemDeductions', e);
    return [];
  }
}

/** Deduction/advance lines for one payroll item. */
export async function getPayrollItemLines(itemId: string): Promise<PayrollItemLineRow[]> {
  try {
    const supabase = await client();
    const { data } = await supabase
      .from('payroll_item_lines')
      .select('*')
      .eq('payroll_item_id', itemId)
      .order('created_at');
    return (data as PayrollItemLineRow[]) ?? [];
  } catch (e) {
    console.error('[queries] getPayrollItemLines', e);
    return [];
  }
}

/** All deduction/advance lines across every item of one run — for the detail page. */
export async function getPayrollRunLines(itemIds: string[]): Promise<PayrollItemLineRow[]> {
  if (itemIds.length === 0) return [];
  try {
    const supabase = await client();
    const { data } = await supabase
      .from('payroll_item_lines')
      .select('*')
      .in('payroll_item_id', itemIds)
      .order('created_at');
    return (data as PayrollItemLineRow[]) ?? [];
  } catch (e) {
    console.error('[queries] getPayrollRunLines', e);
    return [];
  }
}
