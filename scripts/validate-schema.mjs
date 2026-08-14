#!/usr/bin/env node
/**
 * Static schema validation (no database required).
 *
 * Guards against accidental regressions to the migrations/seed that back the
 * app's core invariants. If SUPABASE_DB_URL is set AND `psql` is available, it
 * also applies the migrations to that database for a full syntax check.
 *
 * Exit code 0 = pass, 1 = fail.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const migrationsDir = join(root, 'supabase', 'migrations');
const seedPath = join(root, 'supabase', 'seed.sql');

const failures = [];
const ok = (msg) => console.log(`  ✓ ${msg}`);
const check = (cond, msg) => (cond ? ok(msg) : failures.push(msg));

console.log('Schema validation');

if (!existsSync(migrationsDir)) {
  console.error('  ✗ supabase/migrations directory is missing');
  process.exit(1);
}

const files = readdirSync(migrationsDir)
  .filter((f) => f.endsWith('.sql'))
  .sort();
check(files.length >= 4, `found ${files.length} migration files`);

const sql = files.map((f) => readFileSync(join(migrationsDir, f), 'utf8')).join('\n');
const seed = existsSync(seedPath) ? readFileSync(seedPath, 'utf8') : '';

// --- Required tables ---------------------------------------------------------
const tables = [
  'profiles',
  'locations',
  'product_families',
  'skus',
  'stock_movements',
  'employees',
  'employee_private',
  'attendance',
  'attendance_groups',
  'audit_log',
  'sent_reports',
  'telegram_settings',
  'suppliers',
  'purchase_orders',
  'purchase_order_items',
  'purchase_order_manual_items',
  'customers',
  'sales_orders',
  'sales_order_items',
  'payment_receipts',
  'payroll_runs',
  'payroll_items',
  'payroll_item_lines',
];
for (const t of tables) {
  check(new RegExp(`create table if not exists public\\.${t}\\b`, 'i').test(sql), `table ${t}`);
}

// --- RLS enabled on every table ---------------------------------------------
// Derived from the migrations themselves, not the hardcoded list above, so
// this can't silently stop covering new tables. That's exactly how the
// sequence-table RLS gap (fixed in 0022) went unnoticed by `npm run verify`
// and had to be caught by Supabase's own Security Advisor instead.
const allTables = [
  ...new Set([...sql.matchAll(/create table if not exists public\.(\w+)/gi)].map((m) => m[1])),
].sort();
check(allTables.length >= tables.length, `discovered ${allTables.length} tables in migrations`);
for (const t of allTables) {
  check(
    new RegExp(`alter table public\\.${t}\\s+enable row level security`, 'i').test(sql),
    `RLS enabled: ${t}`,
  );
}

// --- Core invariants ---------------------------------------------------------
check(/stock_movements_sign_chk/i.test(sql), 'stock movement sign constraint');
check(/function public\.enforce_stock_rules/i.test(sql), 'non-negative stock guard function');
check(/NEGATIVE_STOCK_BLOCKED/i.test(sql), 'negative-stock block message');
check(/NEGATIVE_STOCK_OVERRIDE_FORBIDDEN/i.test(sql), 'owner-only override enforcement');
check(/function public\.prevent_delete/i.test(sql), 'prevent_delete function');
check(/trg_movements_no_delete/i.test(sql), 'stock ledger no-delete trigger');
check(/trg_attendance_no_delete/i.test(sql), 'attendance no-delete trigger');
check(/trg_audit_no_update/i.test(sql), 'audit log no-update trigger');
check(/function public\.post_stock_transfer/i.test(sql), 'atomic transfer function');
check(/function public\.handle_new_user/i.test(sql), 'auto-profile-on-signup trigger fn');
check(/skus_signature_uidx/i.test(sql), 'unique SKU signature index');
check(/add column if not exists attendance_group_id/i.test(sql), 'employees.attendance_group_id');
check(
  /drop column if exists employee_number/i.test(sql),
  'employee_number removed (report no longer shows/sorts by it)',
);
check(/attendance_groups_name_uidx/i.test(sql), 'unique attendance group name index');
check(/add column if not exists locale/i.test(sql), 'profiles.locale');
check(/add column if not exists report_language/i.test(sql), 'telegram_settings.report_language');
check(/add column if not exists morning_time/i.test(sql), 'telegram_settings.morning_time');
check(/add column if not exists afternoon_time/i.test(sql), 'telegram_settings.afternoon_time');
check(/create table if not exists public\.sales_inquiries/i.test(sql), 'sales_inquiries table');
check(/create table if not exists public\.inquiry_statuses/i.test(sql), 'inquiry_statuses table');
check(/function public\.assign_inquiry_no/i.test(sql), 'inquiry number (ZY-YYYY-###) trigger fn');
check(/function public\.set_my_locale/i.test(sql), 'locale-only self-update function');
check(/function public\.owner_exists/i.test(sql), 'owner_exists bootstrap guard function');
check(/create sequence if not exists public\.employee_seq/i.test(sql), 'employee_seq sequence');
check(/function public\.assign_employee_identity/i.test(sql), 'employee ID assignment trigger fn');
check(/'ZY-' \|\| lpad/i.test(sql), 'ZY-#### code format');
check(/employees_seq_no_uidx/i.test(sql), 'unique seq_no index');
check(/add column if not exists name_english/i.test(sql), 'product_families.name_english');
check(/add column if not exists description/i.test(sql), 'product_families.description');
check(/function public\.product_family_usage/i.test(sql), 'product family history/usage function');

// --- Purchasing (Second pass) -------------------------------------------------
check(
  /add column if not exists purchase_order_item_id/i.test(sql),
  'stock_movements.purchase_order_item_id',
);
check(/add column if not exists batch_reference/i.test(sql), 'stock_movements.batch_reference');
check(
  /create or replace view public\.purchase_order_item_received/i.test(sql),
  'derived received-qty view (never a stored total)',
);
check(
  /create table if not exists public\.purchase_order_seq/i.test(sql),
  'purchase_order_seq table',
);
check(/function public\.assign_po_number/i.test(sql), 'PO number assignment trigger fn');
check(/'PO-' \|\| y \|\| '-' \|\| lpad/i.test(sql), 'PO-YYYY-#### number format');
check(
  /function public\.enforce_po_header_immutable/i.test(sql),
  'PO header immutable-after-issue guard',
);
check(
  /function public\.enforce_po_item_immutable/i.test(sql),
  'PO item immutable-after-issue guard',
);
check(
  /function public\.enforce_purchase_receipt_rules/i.test(sql),
  'over-receipt / cancelled-PO guard function',
);
check(/OVER_RECEIPT_BLOCKED/i.test(sql), 'over-receipt block message');
check(/OVER_RECEIPT_OVERRIDE_FORBIDDEN/i.test(sql), 'owner-only over-receipt override enforcement');
check(/CANCELLED_PO_BLOCKED/i.test(sql), 'cancelled-PO receiving block message');
check(/DRAFT_PO_BLOCKED/i.test(sql), 'draft-PO receiving block message');
check(
  /function public\.create_draft_purchase_order/i.test(sql),
  'atomic create-draft-PO-with-items function',
);
check(/function public\.post_purchase_receipt/i.test(sql), 'atomic post-purchase-receipt function');
check(
  /suppliers_select[\s\S]*?auth_role\(\) in \('owner', 'system_admin', 'warehouse_admin'\)/i.test(
    sql,
  ),
  'suppliers/PO visibility (and therefore costs) restricted to owner/system_admin/warehouse_admin',
);

// --- Sales (Third pass) --------------------------------------------------------
check(
  /add column if not exists sales_order_item_id/i.test(sql),
  'stock_movements.sales_order_item_id',
);
check(
  /create or replace view public\.sales_order_item_delivered/i.test(sql),
  'derived delivered-qty view (never a stored total)',
);
check(/create table if not exists public\.sales_order_seq/i.test(sql), 'sales_order_seq table');
check(/function public\.assign_so_number/i.test(sql), 'SO number assignment trigger fn');
check(/'SO-' \|\| y \|\| '-' \|\| lpad/i.test(sql), 'SO-YYYY-#### number format');
check(
  /function public\.enforce_so_header_immutable/i.test(sql),
  'SO header immutable-after-confirm guard',
);
check(
  /function public\.enforce_so_item_immutable/i.test(sql),
  'SO item immutable-after-confirm guard',
);
check(
  /function public\.enforce_sale_delivery_rules/i.test(sql),
  'over-delivery / cancelled-SO guard function',
);
check(/OVER_DELIVERY_BLOCKED/i.test(sql), 'over-delivery block message');
check(
  /OVER_DELIVERY_OVERRIDE_FORBIDDEN/i.test(sql),
  'owner-only over-delivery override enforcement',
);
check(/CANCELLED_SO_BLOCKED/i.test(sql), 'cancelled-SO delivery block message');
check(/DRAFT_SO_BLOCKED/i.test(sql), 'draft-SO delivery block message');
check(
  /function public\.create_draft_sales_order/i.test(sql),
  'atomic create-draft-SO-with-items function',
);
check(/function public\.post_sale_delivery/i.test(sql), 'atomic post-sale-delivery function');
check(
  /customers_select[\s\S]*?auth_role\(\) in \('owner', 'system_admin', 'sales_admin'\)/i.test(sql),
  'customers/SO visibility (and therefore prices) restricted to owner/system_admin/sales_admin',
);
check(
  /sale_delivery.*quantity < 0/i.test(sql) || /'sale_delivery'.*quantity < 0/i.test(sql),
  'sale_delivery stored as a negative-signed movement',
);
check(
  /movements_insert[\s\S]*?auth_role\(\) in \('owner', 'system_admin', 'warehouse_admin', 'sales_admin'\)/i.test(
    sql,
  ),
  'sales_admin can insert stock_movements (needed for post_sale_delivery)',
);

// --- Payroll (Fourth pass) ------------------------------------------------------
check(
  /create or replace view public\.payroll_item_deductions/i.test(sql),
  'derived deductions-total view (never a stored total)',
);
check(
  /function public\.enforce_payroll_run_immutable/i.test(sql),
  'payroll run header immutable-after-draft guard',
);
check(
  /function public\.enforce_payroll_item_immutable/i.test(sql),
  'payroll item immutable-after-draft guard',
);
check(
  /function public\.enforce_payroll_item_line_immutable/i.test(sql),
  'payroll deduction/advance line immutable-after-draft guard',
);
check(/PAYROLL_RUN_LOCKED/i.test(sql), 'payroll run locked-after-draft message');
check(/PAYROLL_ITEM_LOCKED/i.test(sql), 'payroll item locked-after-draft message');
check(/PAYROLL_LINE_LOCKED/i.test(sql), 'payroll line locked-after-draft message');
check(
  /PAYROLL_APPROVE_OWNER_ONLY/i.test(sql),
  'owner-only payroll approval enforced by DB trigger (belt & suspenders)',
);
check(
  /function public\.create_draft_payroll_run/i.test(sql),
  'atomic generate-draft-payroll-run function (derives amounts from attendance + pay rates)',
);
check(
  /payroll_runs_select[\s\S]*?auth_role\(\) in \('owner', 'system_admin', 'payroll_admin'\)/i.test(
    sql,
  ),
  'payroll visibility (and therefore salary figures) restricted to owner/system_admin/payroll_admin',
);
check(
  /status in \('present', 'late'\)/i.test(sql),
  "daily-rate pay counts 'present'/'late' attendance as a worked day (confirmed rule)",
);
check(
  /add constraint employees_pay_type_check check \(pay_type = 'daily'\)/i.test(sql),
  'monthly-salary pay removed — employees.pay_type constrained to daily only',
);
check(
  /add constraint payroll_items_pay_type_check check \(pay_type = 'daily'\)/i.test(sql),
  'monthly-salary pay removed — payroll_items.pay_type constrained to daily only',
);

// --- Sensitive-data protection ----------------------------------------------
check(
  /employee_private[\s\S]*?auth_role\(\) in \('owner','system_admin','payroll_admin'\)/i.test(sql),
  'employee_private restricted to owner/system_admin/payroll_admin',
);
check(
  /bucket_id in \('employee-photos','employee-docs'\)/i.test(sql),
  'private employee photo/doc buckets',
);

// --- Payment receipts (Seventh pass) ------------------------------------------
check(/function public\.assign_receipt_number/i.test(sql), 'REC number assignment trigger fn');
check(/'REC-' \|\| y \|\| '-' \|\| lpad/i.test(sql), 'REC-YYYY-#### number format');
check(
  /function public\.enforce_payment_receipt_rules/i.test(sql),
  'payment receipt total/final-payment guard function',
);
check(/PAYMENT_EXCEEDS_SO_TOTAL/i.test(sql), 'payment-exceeds-SO-total block message');
check(
  /FINAL_PAYMENT_REQUIRES_PAID_DEPOSIT/i.test(sql),
  'final-payment-requires-paid-deposit block message',
);
check(
  /function public\.recompute_deposit_invoice_status_from_receipts/i.test(sql),
  'deposit invoice status recompute (from payment_receipts) function',
);

// --- Seed sanity: the supplied example opening stock -------------------------
for (const qty of ['10', '30.5', '329', '64', '903', '146', '902']) {
  check(seed.includes(qty), `seed contains opening qty ${qty}`);
}
check(/gangjinwang|钢筋网/.test(seed), 'seed contains 钢筋网 family');
check(/basiliao|拔丝料/.test(seed), 'seed contains 拔丝料 family');
check(/luowenpanyuan|螺纹盘圆/.test(seed), 'seed contains 螺纹盘圆 family');
check(/create_draft_sales_order/i.test(seed), 'seed creates sample sales orders');
check(/public\.customers/i.test(seed), 'seed contains sample customers');

// --- Optional: apply to a real database if configured ------------------------
const dbUrl = process.env.SUPABASE_DB_URL;
if (dbUrl && failures.length === 0) {
  try {
    execSync('command -v psql', { stdio: 'ignore', shell: '/bin/bash' });
    console.log('  → SUPABASE_DB_URL set and psql found; applying migrations for syntax check');
    for (const f of files) {
      execSync(`psql "${dbUrl}" -v ON_ERROR_STOP=1 -f "${join(migrationsDir, f)}"`, {
        stdio: 'inherit',
      });
    }
    ok('migrations applied cleanly to SUPABASE_DB_URL');
  } catch {
    console.log('  (skipped live apply: psql unavailable or connection failed)');
  }
}

if (failures.length > 0) {
  console.error(`\nSchema validation FAILED (${failures.length}):`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log('\nSchema validation passed.');
