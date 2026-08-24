import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type {
  AttendanceGroupRow,
  AttendanceRow,
  AuditLogRow,
  CustomerRow,
  DepositInvoicePaymentRow,
  DepositInvoiceRow,
  PaymentReceiptRow,
  EmployeeRow,
  EmployeePrivateRow,
  InquiryCustomerTypeRow,
  InquiryFollowupRow,
  InquiryStatusRow,
  LocationRow,
  LoginEventRow,
  OvertimeEntryRow,
  OvertimeSettingsRow,
  QuotationItemRow,
  QuotationRow,
  PayrollItemDeductionsRow,
  PayrollItemLineRow,
  PayrollItemLiveRow,
  PayrollItemRow,
  PayrollRunRow,
  ProductFamilyRow,
  ProfileRow,
  PurchaseOrderRow,
  PurchaseOrderManualItemRow,
  SalesInquiryRow,
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

export interface PageResult<T> {
  rows: T[];
  total: number;
}

export const DEFAULT_PAGE_SIZE = 20;

/**
 * Strips characters with special meaning in PostgREST's .or()/.in() filter
 * syntax (`,`, `(`, `)`) plus ilike wildcards (`%`, `*`) and quotes, since
 * search terms here are free text typed into a search box, not a value this
 * app controls — used before interpolating a term into a hand-built .or()
 * filter string, where those characters could otherwise reshape the filter
 * itself rather than just match text.
 */
function sanitizeSearchTerm(term: string): string {
  return term.replace(/[,()%*"]/g, '').trim();
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

/**
 * `ids` narrows to just those families (e.g. a PDF export rendering one
 * order's line items) so the query filters at the DB instead of fetching the
 * whole catalog and discarding most of it in application code. Omit it for
 * pickers/lists that genuinely need every family.
 */
export async function getFamilies(
  includeArchived = false,
  ids?: string[],
): Promise<ProductFamilyRow[]> {
  if (ids && ids.length === 0) return [];
  try {
    const supabase = await client();
    let q = supabase.from('product_families').select('*').order('name');
    if (!includeArchived) q = q.eq('is_active', true);
    if (ids) q = q.in('id', ids);
    const { data } = await q;
    return (data as ProductFamilyRow[]) ?? [];
  } catch (e) {
    console.error('[queries] getFamilies', e);
    return [];
  }
}

/** `ids` narrows the fetch the same way as getFamilies' `ids` — see its comment. */
export async function getSkus(includeArchived = false, ids?: string[]): Promise<SkuRow[]> {
  if (ids && ids.length === 0) return [];
  try {
    const supabase = await client();
    let q = supabase.from('skus').select('*').order('created_at');
    if (!includeArchived) q = q.eq('is_active', true);
    if (ids) q = q.in('id', ids);
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

/**
 * Batched version of `getSignedPhotoUrl`, for a list of employees (the
 * Employees page) — one Storage API round-trip for every photo instead of
 * one per employee. Keyed by the storage path so callers can look up each
 * employee's URL regardless of the response order.
 */
export async function getSignedPhotoUrls(paths: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(paths)];
  if (unique.length === 0) return new Map();
  try {
    const supabase = await client();
    const { data } = await supabase.storage.from('employee-photos').createSignedUrls(unique, 120);
    const byPath = new Map<string, string>();
    for (const row of data ?? []) {
      if (row.path && row.signedUrl) byPath.set(row.path, row.signedUrl);
    }
    return byPath;
  } catch (e) {
    console.error('[queries] getSignedPhotoUrls', e);
    return new Map();
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

export async function getLoginEvents(limit = 100): Promise<LoginEventRow[]> {
  try {
    const supabase = await client();
    const { data } = await supabase
      .from('login_events')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    return (data as LoginEventRow[]) ?? [];
  } catch (e) {
    console.error('[queries] getLoginEvents', e);
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
      .eq('status', 'ordered');
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

/**
 * Paginated + searchable purchase_orders — the list page's real query.
 * getPurchaseOrders() (unfiltered, above) stays for callers that genuinely
 * need every order (exports). Same shape as getSalesOrdersPage: search
 * matches po_number directly, plus supplier name via a resolve-then-filter
 * step, both folded into one .or() so pagination's count/range stays over a
 * single query.
 */
export async function getPurchaseOrdersPage({
  page,
  pageSize = DEFAULT_PAGE_SIZE,
  search,
}: {
  page: number;
  pageSize?: number;
  search?: string;
}): Promise<PageResult<PurchaseOrderRow>> {
  try {
    const supabase = await client();
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    let q = supabase.from('purchase_orders').select('*', { count: 'exact' });

    const term = search ? sanitizeSearchTerm(search) : '';
    if (term) {
      const { data: matches } = await supabase
        .from('suppliers')
        .select('id')
        .ilike('name', `%${term}%`);
      const supplierIds = (matches ?? []).map((s) => s.id);
      const orParts = [`po_number.ilike.%${term}%`];
      if (supplierIds.length > 0) orParts.push(`supplier_id.in.(${supplierIds.join(',')})`);
      q = q.or(orParts.join(','));
    }

    const { data, count } = await q.order('created_at', { ascending: false }).range(from, to);
    return { rows: (data as PurchaseOrderRow[]) ?? [], total: count ?? 0 };
  } catch (e) {
    console.error('[queries] getPurchaseOrdersPage', e);
    return { rows: [], total: 0 };
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

/** Free-text product lines — mirrors getPurchaseOrderItems' shape, no sku_id. */
export async function getPurchaseOrderManualItems(
  purchaseOrderId?: string | string[],
): Promise<PurchaseOrderManualItemRow[]> {
  if (Array.isArray(purchaseOrderId) && purchaseOrderId.length === 0) return [];
  try {
    const supabase = await client();
    let q = supabase.from('purchase_order_manual_items').select('*').order('created_at');
    if (Array.isArray(purchaseOrderId)) q = q.in('purchase_order_id', purchaseOrderId);
    else if (purchaseOrderId) q = q.eq('purchase_order_id', purchaseOrderId);
    const { data } = await q;
    return (data as PurchaseOrderManualItemRow[]) ?? [];
  } catch (e) {
    console.error('[queries] getPurchaseOrderManualItems', e);
    return [];
  }
}

// --- Sales (Third pass) --------------------------------------------------------

/** `ids` narrows the fetch the same way as getSkus' `ids` — see its comment. */
export async function getCustomers(
  includeArchived = false,
  ids?: string[],
): Promise<CustomerRow[]> {
  if (ids && ids.length === 0) return [];
  try {
    const supabase = await client();
    let q = supabase.from('customers').select('*').order('name');
    if (!includeArchived) q = q.eq('is_active', true);
    if (ids) q = q.in('id', ids);
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

/**
 * Paginated + searchable sales_orders — the list page's real query.
 * getSalesOrders() (unfiltered, above) stays for callers that genuinely need
 * every order (exports). search matches so_number directly, plus customer
 * name via a resolve-then-filter step (customer_id isn't itself searchable
 * text) — both folded into one .or() so pagination's count/range stays over
 * a single query rather than merging two separately-paginated result sets.
 */
export async function getSalesOrdersPage({
  page,
  pageSize = DEFAULT_PAGE_SIZE,
  search,
}: {
  page: number;
  pageSize?: number;
  search?: string;
}): Promise<PageResult<SalesOrderRow>> {
  try {
    const supabase = await client();
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    let q = supabase.from('sales_orders').select('*', { count: 'exact' });

    const term = search ? sanitizeSearchTerm(search) : '';
    if (term) {
      const { data: matches } = await supabase
        .from('customers')
        .select('id')
        .ilike('name', `%${term}%`);
      const customerIds = (matches ?? []).map((c) => c.id);
      const orParts = [`so_number.ilike.%${term}%`];
      if (customerIds.length > 0) orParts.push(`customer_id.in.(${customerIds.join(',')})`);
      q = q.or(orParts.join(','));
    }

    const { data, count } = await q.order('created_at', { ascending: false }).range(from, to);
    return { rows: (data as SalesOrderRow[]) ?? [], total: count ?? 0 };
  } catch (e) {
    console.error('[queries] getSalesOrdersPage', e);
    return { rows: [], total: 0 };
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

export async function getSalesOrderItems(
  salesOrderId?: string | string[],
): Promise<SalesOrderItemRow[]> {
  if (Array.isArray(salesOrderId) && salesOrderId.length === 0) return [];
  try {
    const supabase = await client();
    let q = supabase.from('sales_order_items').select('*').order('created_at');
    if (Array.isArray(salesOrderId)) q = q.in('sales_order_id', salesOrderId);
    else if (salesOrderId) q = q.eq('sales_order_id', salesOrderId);
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

/** The one active (non-void) deposit invoice for a SO, if any — enforced unique by the DB. */
export async function getDepositInvoiceForSo(
  salesOrderId: string,
): Promise<DepositInvoiceRow | null> {
  try {
    const supabase = await client();
    const { data } = await supabase
      .from('deposit_invoices')
      .select('*')
      .eq('sales_order_id', salesOrderId)
      .neq('status', 'void')
      .maybeSingle();
    return (data as DepositInvoiceRow) ?? null;
  } catch (e) {
    console.error('[queries] getDepositInvoiceForSo', e);
    return null;
  }
}

export async function getDepositInvoice(id: string): Promise<DepositInvoiceRow | null> {
  try {
    const supabase = await client();
    const { data } = await supabase.from('deposit_invoices').select('*').eq('id', id).maybeSingle();
    return (data as DepositInvoiceRow) ?? null;
  } catch (e) {
    console.error('[queries] getDepositInvoice', e);
    return null;
  }
}

/**
 * Payment ledger for one deposit invoice, newest first. DORMANT since
 * 0030_payment_receipts.sql — the app no longer writes deposit_invoice_payments
 * (payment_receipts replaced it); kept for reference only, not called anywhere.
 */
export async function getDepositInvoicePayments(
  depositInvoiceId: string,
): Promise<DepositInvoicePaymentRow[]> {
  try {
    const supabase = await client();
    const { data } = await supabase
      .from('deposit_invoice_payments')
      .select('*')
      .eq('deposit_invoice_id', depositInvoiceId)
      .order('paid_date', { ascending: false });
    return (data as DepositInvoicePaymentRow[]) ?? [];
  } catch (e) {
    console.error('[queries] getDepositInvoicePayments', e);
    return [];
  }
}

/** Full payment-receipt history (deposit + final) for a Sales Order, newest first. */
export async function getPaymentReceiptsForSo(salesOrderId: string): Promise<PaymentReceiptRow[]> {
  try {
    const supabase = await client();
    const { data } = await supabase
      .from('payment_receipts')
      .select('*')
      .eq('sales_order_id', salesOrderId)
      .order('created_at', { ascending: false });
    return (data as PaymentReceiptRow[]) ?? [];
  } catch (e) {
    console.error('[queries] getPaymentReceiptsForSo', e);
    return [];
  }
}

export async function getPaymentReceipt(id: string): Promise<PaymentReceiptRow | null> {
  try {
    const supabase = await client();
    const { data } = await supabase.from('payment_receipts').select('*').eq('id', id).maybeSingle();
    return (data as PaymentReceiptRow) ?? null;
  } catch (e) {
    console.error('[queries] getPaymentReceipt', e);
    return null;
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

/**
 * Paginated payroll_runs — the list page's real query. getPayrollRuns()
 * (above) stays for callers that need every run. Scoping items/deductions to
 * just this page's run ids (done by the caller) is what actually fixes the
 * unbounded payroll_item_deductions scan the perf audit flagged — this
 * function only supplies the run ids to scope to.
 */
export async function getPayrollRunsPage({
  page,
  pageSize = DEFAULT_PAGE_SIZE,
}: {
  page: number;
  pageSize?: number;
}): Promise<PageResult<PayrollRunRow>> {
  try {
    const supabase = await client();
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const { data, count } = await supabase
      .from('payroll_runs')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);
    return { rows: (data as PayrollRunRow[]) ?? [], total: count ?? 0 };
  } catch (e) {
    console.error('[queries] getPayrollRunsPage', e);
    return { rows: [], total: 0 };
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

export async function getPayrollItems(payrollRunId?: string | string[]): Promise<PayrollItemRow[]> {
  if (Array.isArray(payrollRunId) && payrollRunId.length === 0) return [];
  try {
    const supabase = await client();
    let q = supabase.from('payroll_items').select('*').order('created_at');
    if (Array.isArray(payrollRunId)) q = q.in('payroll_run_id', payrollRunId);
    else if (payrollRunId) q = q.eq('payroll_run_id', payrollRunId);
    const { data } = await q;
    return (data as PayrollItemRow[]) ?? [];
  } catch (e) {
    console.error('[queries] getPayrollItems', e);
    return [];
  }
}

/**
 * Recomputed-from-current-attendance figures for Draft-run items, via the
 * `payroll_items_live` view (0026_payroll_items_live.sql) — pass the item ids
 * belonging to Draft runs only; `buildPayrollRunRows` (payroll-view.ts)
 * overlays these onto the stored snapshot for items whose run is still
 * Draft, so Approved/Paid runs keep their frozen numbers untouched.
 */
export async function getPayrollItemsLive(itemIds: string[]): Promise<PayrollItemLiveRow[]> {
  if (itemIds.length === 0) return [];
  try {
    const supabase = await client();
    const { data } = await supabase.from('payroll_items_live').select('*').in('id', itemIds);
    return (data as PayrollItemLiveRow[]) ?? [];
  } catch (e) {
    console.error('[queries] getPayrollItemsLive', e);
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

// --- Quotations ----------------------------------------------------------------

export async function getQuotations(): Promise<QuotationRow[]> {
  try {
    const supabase = await client();
    const { data } = await supabase
      .from('quotations')
      .select('*')
      .order('quotation_date', { ascending: false })
      .order('created_at', { ascending: false });
    return (data as QuotationRow[]) ?? [];
  } catch (e) {
    console.error('[queries] getQuotations', e);
    return [];
  }
}

/**
 * Paginated + searchable quotations — the list page's real query.
 * getQuotations() (unfiltered, above) stays for callers that genuinely need
 * every quotation (exports). customer_name is denormalized directly onto
 * the row (unlike sales_orders/purchase_orders), so search is a single
 * .or() with no resolve-then-filter join step.
 */
export async function getQuotationsPage({
  page,
  pageSize = DEFAULT_PAGE_SIZE,
  search,
}: {
  page: number;
  pageSize?: number;
  search?: string;
}): Promise<PageResult<QuotationRow>> {
  try {
    const supabase = await client();
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    let q = supabase.from('quotations').select('*', { count: 'exact' });

    const term = search ? sanitizeSearchTerm(search) : '';
    if (term) {
      q = q.or(`quotation_no.ilike.%${term}%,customer_name.ilike.%${term}%`);
    }

    const { data, count } = await q
      .order('quotation_date', { ascending: false })
      .order('created_at', { ascending: false })
      .range(from, to);
    return { rows: (data as QuotationRow[]) ?? [], total: count ?? 0 };
  } catch (e) {
    console.error('[queries] getQuotationsPage', e);
    return { rows: [], total: 0 };
  }
}

export async function getQuotation(id: string): Promise<QuotationRow | null> {
  try {
    const supabase = await client();
    const { data } = await supabase.from('quotations').select('*').eq('id', id).maybeSingle();
    return (data as QuotationRow) ?? null;
  } catch (e) {
    console.error('[queries] getQuotation', e);
    return null;
  }
}

/** Line items for one quotation, or for many (when listing). */
export async function getQuotationItems(
  quotationId?: string | string[],
): Promise<QuotationItemRow[]> {
  if (Array.isArray(quotationId) && quotationId.length === 0) return [];
  try {
    const supabase = await client();
    let q = supabase.from('quotation_items').select('*');
    if (Array.isArray(quotationId)) q = q.in('quotation_id', quotationId);
    else if (quotationId) q = q.eq('quotation_id', quotationId);
    const { data } = await q.order('line_no');
    return (data as QuotationItemRow[]) ?? [];
  } catch (e) {
    console.error('[queries] getQuotationItems', e);
    return [];
  }
}

/**
 * The (at most one) Sales Order auto-created from each of these quotations'
 * paid deposits — batched for the Quotations list page's "→ SO-xxxx"
 * cross-link, mirroring getPayrollItemDeductions' batch-by-ids shape.
 */
export async function getSalesOrdersByQuotationIds(
  quotationIds: string[],
): Promise<Pick<SalesOrderRow, 'id' | 'so_number' | 'quotation_id'>[]> {
  if (quotationIds.length === 0) return [];
  try {
    const supabase = await client();
    const { data } = await supabase
      .from('sales_orders')
      .select('id, so_number, quotation_id')
      .in('quotation_id', quotationIds);
    return (data as Pick<SalesOrderRow, 'id' | 'so_number' | 'quotation_id'>[]) ?? [];
  } catch (e) {
    console.error('[queries] getSalesOrdersByQuotationIds', e);
    return [];
  }
}

// --- Overtime 加班 --------------------------------------------------------------

export async function getOvertimeSettings(): Promise<OvertimeSettingsRow | null> {
  try {
    const supabase = await client();
    const { data } = await supabase.from('overtime_settings').select('*').eq('id', 1).maybeSingle();
    return (data as OvertimeSettingsRow) ?? null;
  } catch (e) {
    console.error('[queries] getOvertimeSettings', e);
    return null;
  }
}

/** Overtime entries, optionally limited to a business-date range. */
export async function getOvertimeEntries(from?: string, to?: string): Promise<OvertimeEntryRow[]> {
  try {
    const supabase = await client();
    let q = supabase.from('overtime_entries').select('*');
    if (from) q = q.gte('business_date', from);
    if (to) q = q.lte('business_date', to);
    const { data } = await q
      .order('business_date', { ascending: false })
      .order('created_at', { ascending: false });
    return (data as OvertimeEntryRow[]) ?? [];
  } catch (e) {
    console.error('[queries] getOvertimeEntries', e);
    return [];
  }
}

// --- Customer price inquiries -------------------------------------------------

export async function getInquiryCustomerTypes(
  includeArchived = false,
): Promise<InquiryCustomerTypeRow[]> {
  try {
    const supabase = await client();
    let q = supabase.from('inquiry_customer_types').select('*').order('sort_order').order('name');
    if (!includeArchived) q = q.eq('is_active', true);
    const { data } = await q;
    return (data as InquiryCustomerTypeRow[]) ?? [];
  } catch (e) {
    console.error('[queries] getInquiryCustomerTypes', e);
    return [];
  }
}

export async function getInquiryStatuses(includeArchived = false): Promise<InquiryStatusRow[]> {
  try {
    const supabase = await client();
    let q = supabase.from('inquiry_statuses').select('*').order('sort_order').order('name');
    if (!includeArchived) q = q.eq('is_active', true);
    const { data } = await q;
    return (data as InquiryStatusRow[]) ?? [];
  } catch (e) {
    console.error('[queries] getInquiryStatuses', e);
    return [];
  }
}

export async function getInquiries(): Promise<SalesInquiryRow[]> {
  try {
    const supabase = await client();
    const { data } = await supabase
      .from('sales_inquiries')
      .select('*')
      .order('inquiry_date', { ascending: false })
      .order('created_at', { ascending: false });
    return (data as SalesInquiryRow[]) ?? [];
  } catch (e) {
    console.error('[queries] getInquiries', e);
    return [];
  }
}

export async function getInquiryFollowups(): Promise<InquiryFollowupRow[]> {
  try {
    const supabase = await client();
    const { data } = await supabase
      .from('inquiry_followups')
      .select('*')
      .order('follow_up_date', { ascending: false })
      .order('created_at', { ascending: false });
    return (data as InquiryFollowupRow[]) ?? [];
  } catch (e) {
    console.error('[queries] getInquiryFollowups', e);
    return [];
  }
}

/**
 * Count-only (no row data transferred) — for the dashboard's "Open inquiries"
 * tile. Open = status unset or its category is neither won nor lost (mirrors
 * summarizeInquiries' pendingFollowups in src/lib/domain/sales-inquiry.ts).
 */
export async function getOpenInquiryCount(): Promise<number> {
  try {
    const supabase = await client();
    const { data: decided } = await supabase
      .from('inquiry_statuses')
      .select('id')
      .in('category', ['won', 'lost']);
    const decidedIds = (decided ?? []).map((s) => s.id as string);
    let q = supabase.from('sales_inquiries').select('id', { count: 'exact', head: true });
    if (decidedIds.length > 0) {
      q = q.or(`status_id.is.null,status_id.not.in.(${decidedIds.join(',')})`);
    }
    const { count } = await q;
    return count ?? 0;
  } catch (e) {
    console.error('[queries] getOpenInquiryCount', e);
    return 0;
  }
}
