# Data Dictionary — Zysteel Operations

Source of truth: `supabase/migrations/*.sql`. Update this file in the same change
whenever the schema changes (AGENTS.md rule 5).

## Enums & controlled values

- **Roles** (`app_role`): `owner`, `system_admin`, `attendance_admin`,
  `warehouse_admin`, `sales_admin`, `payroll_admin`, `viewer`.
- **Movement types**: `opening_balance`, `purchase_receipt`, `production_output`,
  `sale_delivery`, `other_stock_out`, `adjustment`, `transfer_out`, `transfer_in`.
- **Purchase order status**: `draft`, `ordered`, `cancelled` (the app-level enum —
  purchase orders are header-only records, no receiving, so there is no
  receipt-derived state. The DB CHECK constraint still permits the legacy
  `partially_received`/`received` values for backward compatibility with any
  historical rows, but the app never sets them). **Sales order status**:
  `draft`, `confirmed`, `partially_delivered`, `delivered`, `cancelled`
  (unchanged — Sales still tracks line items and delivery). **Currencies**:
  `USD`, `KHR`, `CNY` (one per PO/SO, no conversion).
- **Conditions**: `normal` (正常), `old` (旧), `rough_edge` (错毛边), `damaged` (损坏).
- **Attendance status**: `present`, `late`, `leave`, `absent` (+ derived `unmarked`).
  In the grouped Telegram report "实到" (actual present) = present + late; exception
  sections render as 请假 (leave) · 缺勤 (absent) · 迟到 (late) · 未打卡 (unmarked).
- **Shift**: `morning`, `afternoon`. **Pay type**: `daily` (the only value —
  `employees.pay_type`/`payroll_items.pay_type` are constrained to it; see
  migration 0016).
- **Payroll run status**: `draft`, `approved`, `paid`, `cancelled`. **Payroll
  deduction/advance line kind**: `deduction`, `advance`. Payroll amounts are
  USD only (no currency field, matching `employee_private`).

## Tables

### profiles
1:1 with `auth.users`. `id`, `email`, `full_name`, `role app_role`, `is_active`,
`locale` (`'en'`/`'zh'`, nullable — the user's saved UI language), `created_at`.
First signup ⇒ `owner`; others ⇒ `viewer` (trigger `handle_new_user`). Users set
their own `locale` via the `set_my_locale` RPC (no broad self-update policy, so
`role` cannot be self-escalated).

### locations
Editable stock locations. `id`, `code` (unique), `name`, `is_active`,
`created_at`. Seeded: `storage_room`, `warehouse`.

### product_families
Editable families. `id`, `code` (unique), `name`, `default_unit`, `is_active`,
`created_at`. Seeded: `gangjinwang` 钢筋网, `luowenpanyuan` 螺纹盘圆, `basiliao`
拔丝料.

### skus
One row per **unique specification**. `id`, `family_id → product_families`,
`diameter`, `size`, `hole`, `rod_count`, `extra`, `condition`, `unit`,
`minimum_level numeric(14,3)`, `is_active`, `notes`, `created_at`. Uniqueness is
enforced by `skus_signature_uidx` over the (case/space-normalised) attribute set.

### stock_movements  *(append-only ledger)*
`id`, `sku_id → skus`, `location_id → locations`, `type`, `quantity numeric(14,3)`
(**signed**), `business_date date`, `transfer_group_id`, `override_reason`,
`notes`, `attachment_path`, `purchase_order_item_id → purchase_order_items`
(nullable — set only for `purchase_receipt` rows), `batch_reference`,
`sales_order_item_id → sales_order_items` (nullable — set only for
`sale_delivery` rows), `created_by → profiles`, `created_at`.
- `stock_movements_sign_chk`: inbound types `> 0`, outbound `< 0`, `adjustment ≠ 0`
  — `sale_delivery` is outbound, so it is always stored **negative**.
- Trigger `enforce_stock_rules` blocks negative balances unless Owner + reason.
- Trigger `enforce_purchase_receipt_rules` (Second pass) still exists in the DB
  but is **dormant** — Purchasing was simplified to header-only records with no
  structured receiving, so nothing in the app posts `purchase_receipt` rows or
  calls this trigger's path anymore. Left in place rather than dropped, since
  migrations are additive-only.
- Trigger `enforce_sale_delivery_rules` (Third pass) is the mirror image and
  IS still active: blocks delivering against a draft/cancelled SO, and blocks
  over-delivery (delivered > ordered on that item) unless Owner + a recorded
  reason.
- Triggers block UPDATE and DELETE (append-only).
- **View `stock_balances`** = `SUM(quantity)` grouped by `sku_id, location_id`
  (`security_invoker`, so RLS applies).
- **View `purchase_order_item_received`** still exists in the DB but is
  **dormant** for the same reason as `enforce_purchase_receipt_rules` above —
  nothing queries it anymore now that Purchasing has no line items.
- **View `sales_order_item_delivered`** = `SUM(-quantity)` of `sale_delivery` rows
  (negated back to a positive count) grouped by `sales_order_item_id` —
  delivered/outstanding quantity is likewise never stored.

### attendance_groups
Editable groups that structure the attendance report (老板助理, 工厂主管, …).
`id`, `name` (unique, case-insensitive), `sort_order` (report order), `is_active`
(archive/reactivate), `created_at`. Seeded with 9 groups in order.

### employees  *(non-sensitive)*
`id`, `employee_code` (unique — auto-generated `ZY-0001` from `seq_no`),
`seq_no` (unique; permanent, never-reused sequence from `employee_seq`),
`name_khmer`, `name_english`, `name_chinese`, `phone`, `department`, `position`,
`start_date`, `is_active`, `pay_type`, `photo_path`, `photo_thumb_path` (128px
`sharp`-generated copy, list view only — nullable, falls back to `photo_path`
until re-upload), `notes`, `created_at`.
The `assign_employee_identity` BEFORE INSERT trigger sets `seq_no` and
`employee_code = 'ZY-' || lpad(seq_no,4,'0')`. Employee IDs are **never
entered by the client** and never reused, even after archiving.
Report/grouping fields (added in 0005): `attendance_group_id → attendance_groups`,
`display_name`, `job_title`, `label` (optional, e.g. 备用). The attendance
report's exception list (请假/缺勤/迟到/未打卡) is sorted by group order then
display name, and shows just `{display name} {job title}` per line —
`label` isn't shown either. `employee_number` (the old "7号" report override)
was removed entirely (migration 0017): it's no longer a column, form field,
or display anywhere.

### employee_private  *(SENSITIVE)*
`employee_id → employees (PK)`, `base_salary` (unused — kept only because
dropping the column is a larger, unneeded change for a value nothing
references since monthly-salary pay was removed), `daily_rate`,
`emergency_contact`, `updated_at`. RLS: Owner / System Admin / Payroll Admin
only.

### attendance
`id`, `employee_id → employees`, `business_date`, `shift`, `status`, `notes`,
`created_by`, `updated_by`, `created_at`, `updated_at`. Unique
`(employee_id, business_date, shift)`. Updates allowed (corrections); DELETE
blocked by trigger.

### audit_log  *(immutable)*
`id`, `actor_id`, `actor_email`, `action`, `entity`, `entity_id`,
`old_value jsonb`, `new_value jsonb`, `created_at`. UPDATE/DELETE blocked by
triggers. Never store secrets or raw salary values here.

### sent_reports  *(Telegram idempotency)*
`id`, `report_key` (unique), `report_type`, `business_date`, `chat_id`,
`status` (`sent`/`failed`), `detail`, `created_at`. Scheduled key =
`"<type>:<YYYY-MM-DD>"`; manual sends use a `manual:…:<epoch>` key.

### telegram_settings  *(single row, id = 1)*
`chat_id`, `morning_enabled`, `afternoon_enabled`, `inventory_enabled`,
`morning_time` (HH:mm, default `08:00`), `afternoon_time` (HH:mm, default
`13:00`), `inventory_time` (HH:mm, default `18:00`) — all editable send times in
Asia/Bangkok, checked by `telegram_settings_times_chk`; the scheduler reads
them dynamically. `report_language` (`'en'`/`'zh'`, default `'zh'` — future-ready;
the attendance report is currently always sent in Chinese), `updated_at`.

### suppliers  *(editable master data, Second pass)*
`id`, `name`, `name_chinese`, `name_english`, `contact_person`, `phone`,
`address`, `tax_id`, `payment_terms`, `default_currency` (`USD`/`KHR`/`CNY`),
`notes`, `is_active`, `created_at`, `updated_at`. Referenced by
`purchase_orders.supplier_id` `ON DELETE RESTRICT` — a supplier with any
purchase history cannot be hard-deleted (archive instead); `deleteSupplier`
pre-checks this and the FK is the backstop.

### purchase_orders  *(header-only record — no line items, no receiving)*
`id`, `po_number` (unique, auto `PO-YYYY-####` — atomic per-calendar-year
counter via `purchase_order_seq` + `assign_po_number` trigger), `supplier_id →
suppliers`, `order_date`, `currency`, `status`, `notes`, `attachment_path`,
`created_by → profiles`, `issued_at`, `cancelled_at`, `created_at`,
`updated_at`.
- One currency per PO; no exchange-rate conversion.
- Trigger `enforce_po_header_immutable`: once `status <> 'draft'`, `supplier_id`
  /`currency`/`order_date` can no longer change (`notes`, `attachment_path`,
  `status` remain editable).
- `status` is a plain stored field, set only by the app on Issue/Cancel — no
  receiving, so nothing recomputes it afterward.
- **Editable while Draft** — `updatePurchaseOrderHeader`
  (`src/lib/actions/purchasing.ts`) lets a Draft PO's supplier/currency/order
  date/notes be corrected via `EditPoDialog`, mirroring Payroll's
  `EditRunDialog`/`updatePayrollRunDates` pattern exactly. Attachment is not
  re-editable in this dialog (the upload widget has no way to show/preserve
  an existing file) — create a new PO if the wrong file was attached. The DB
  trigger above is the actual enforcement; the action just checks
  `status === 'draft'` first for a friendly message.
- The table still has an `expected_arrival_date` column (nullable) and an
  `expected_arrival_idx` index — the Overdue/Expected Arrival Date feature
  (and its `isOverdue`/`isDueWithinDays` domain helpers) was removed from the
  app, but the column was left in place rather than dropped (migrations are
  additive-only, and dropping it would destroy any historical values already
  recorded on existing production orders). Nothing reads or writes it
  anymore — same posture as `purchase_order_items` below.

### purchase_order_items  *(dormant — table remains in the DB, unused by the app)*
Purchasing was simplified to header-only records; nothing creates, reads, or
deletes rows in this table anymore. A catalog-linked (SKU/location, qty,
unit cost) version of this feature was reactivated and then reverted at the
user's request within the same session — the app went back to not using
this table at all. Left in the schema rather than dropped (migrations are
additive-only) — see `purchase_orders` above for what a PO actually is now.
Historical columns, for reference only: `id`, `purchase_order_id →
purchase_orders` (cascade), `sku_id → skus`, `location_id → locations`,
`unit`, `ordered_qty`, `unit_cost`, `line_total`. Trigger
`enforce_po_item_immutable` (UPDATE + DELETE) is likewise dormant.

### purchase_order_manual_items  *(active — free text, NO catalog connection)*
What Purchasing actually uses to record what's being bought: `id`,
`purchase_order_id → purchase_orders` (cascade), `product_name` (required,
free text), `quantity` (nullable), `unit` (nullable, free text), `unit_price`
(nullable), `line_total` (**generated column**, `quantity * unit_price`,
null when either input is null — never separately stored). Deliberately has
**no `sku_id`, no `location_id`, no FK to `skus`/`product_families` at
all** — the user explicitly asked for a manual product field with no
connection to the family/SKU catalog, so this is a plain descriptive table,
not an inventory-affecting one (never referenced by `stock_movements`).
- **No immutability trigger** — freely addable/removable at any PO status
  (`addPurchaseOrderManualItem`/`removePurchaseOrderManualItem`,
  `src/lib/actions/purchasing.ts`), same editability posture as the header's
  own `notes`/`attachment_path` fields, since these lines are plain
  description text, not a binding commercial commitment the way the
  catalog-linked line items above were.
- RLS matches `purchase_orders`/`suppliers` exactly (owner/system_admin/
  warehouse_admin select; owner/warehouse_admin write).

### customers  *(editable master data, Third pass)*
`id`, `name`, `name_chinese`, `name_english`, `contact_person`, `phone`,
`address`, `tax_id`, `payment_terms`, `default_currency` (`USD`/`KHR`/`CNY`),
`notes`, `is_active`, `created_at`, `updated_at`. Referenced by
`sales_orders.customer_id` `ON DELETE RESTRICT` — a customer with any sales
history cannot be hard-deleted (archive instead); `deleteCustomer` pre-checks
this and the FK is the backstop.

### sales_orders  *(Third pass; `payment_status` added Fifth pass; `quotation_id` added Sixth pass)*
`id`, `so_number` (unique, auto `SO-YYYY-####` — atomic per-calendar-year
counter via `sales_order_seq` + `assign_so_number` trigger), `customer_id →
customers`, `order_date`, `expected_delivery_date`, `currency`, `status`,
`payment_status`, `notes`, `attachment_path`, `quotation_id → quotations`
(nullable, `on delete set null`), `created_by → profiles`,
`confirmed_at`, `cancelled_at`, `created_at`, `updated_at`.
- One currency per SO; no exchange-rate conversion.
- Trigger `enforce_so_header_immutable`: once `status <> 'draft'`, `customer_id`
  /`currency`/`order_date` can no longer change (`expected_delivery_date`,
  `notes`, `attachment_path`, `status` remain editable — delivery dates slip).
  The same trigger also blocks the `draft → confirmed` transition when the SO
  has zero line items (`SO_CONFIRM_NO_ITEMS`) — see `sales_order_items` below
  for why a Draft SO can legitimately start out empty.
- `status` is the one sales field that IS stored (not derived): set by the app
  on Confirm/Cancel, and recomputed by `post_sale_delivery` after each delivery
  from `SUM(ordered) vs SUM(delivered)` across all of the SO's items.
- `payment_status` (`none`/`pending_deposit`/`partially_paid`/`paid`) is
  orthogonal to `status` — it tracks the SO's deposit invoice, not delivery.
  Mirrored by trigger `mirror_deposit_invoice_status` from the SO's active
  `deposit_invoices.status`; the app never writes it directly.
- `quotation_id` is set when this order was auto-created from a Quotation's
  paid deposit (`markPaid` in `src/lib/actions/quotations.ts`) — see the
  `quotations` section below for the full flow. `on delete set null` rather
  than cascade/restrict: deleting the source quotation record must never
  touch a real order that money has already been paid against.

### sales_order_items  *(Third pass; `area_per_sheet`/`price_per_sqm` added Fifth pass)*
`id`, `sales_order_id → sales_orders` (cascade), `sku_id → skus`,
`location_id → locations` (which location this line delivers out of), `unit`
(copied from the SKU at insert time — never user-chosen, so there is no
unit-conversion path to get wrong), `ordered_qty`, `unit_price`, `line_total`
(**generated always as** `ordered_qty * unit_price`), `area_per_sheet`
(nullable), `price_per_sqm` (nullable). Delivered/outstanding quantity is
derived, never stored (see `sales_order_item_delivered` above).
- Triggers `enforce_so_item_immutable` (INSERT + UPDATE + DELETE, INSERT added
  Sixth pass): items are freely editable while the parent SO is `draft`; once
  confirmed they are permanently immutable, matching the ledger's append-only
  philosophy. INSERT is guarded too because items can now arrive two ways —
  all at once via `create_draft_sales_order`, or one at a time via
  `addSalesOrderItem` against an already-existing Draft order.
- `area_per_sheet`/`price_per_sqm` are an optional per-m² pricing breakdown.
  `unit_price` stays the money source of truth: `create_draft_sales_order`
  derives it server-side (`price_per_sqm × area_per_sheet`) when both are
  supplied, and ignores any client-computed `unit_price` in that case; when
  either is absent, `unit_price` is taken as entered (the legacy flat-price
  path). Used to display Price/m² and Area/sheet on a Deposit Invoice.
- **A Draft SO may legitimately have ZERO items** (Sixth pass — previously
  `create_draft_sales_order` rejected an empty `p_items` array unconditionally;
  that check was removed). This exists for exactly one reason: a SO
  auto-created from a paid Quotation deposit can't populate real items itself
  (quotation lines are free text; SO lines need a real `sku_id`/`location_id`
  resolved against the catalog — see `quotations` below), so it starts empty
  and a human adds each line by hand via `addSalesOrderItem`. The "must have
  ≥1 item" invariant still holds — it just moved from creation time to confirm
  time (`SO_CONFIRM_NO_ITEMS`, above), which is actually more consistent with
  every other `draft`-is-the-mutable-state rule in this schema.

### deposit_invoices  *(Fifth pass)*
`id`, `invoice_number` (unique, auto `DI-YYYY-####`, same numbering shape as
`so_number`/`po_number` via `deposit_invoice_seq` +
`assign_deposit_invoice_number`), `sales_order_id → sales_orders` (restrict),
`deposit_percentage`, `total_order_amount` (snapshot of the SO's line-total
sum at generation time), `deposit_amount`/`remaining_balance` (**generated
always as** `total_order_amount * deposit_percentage / 100` and its
complement), `currency`, `status`
(`pending_deposit`/`partially_paid`/`paid`/`void`), `created_by → profiles`,
`created_at`, `updated_at`.
- Only generatable once the SO is confirmed (`status not in ('draft',
  'cancelled')`) — SO items are already immutable past draft, so the snapshot
  total can't drift.
- Partial unique index on `sales_order_id where status <> 'void'`: at most one
  active deposit invoice per SO.
- `status` is never set directly by the app — trigger
  `recompute_deposit_invoice_status` derives it from the
  `deposit_invoice_payments` ledger after every payment insert (see below).

### deposit_invoice_payments  *(Fifth pass — append-only ledger)*
`id`, `deposit_invoice_id → deposit_invoices` (restrict), `amount`,
`paid_date`, `method`, `notes`, `recorded_by → profiles`, `created_at`. No
UPDATE/DELETE path from the app — matches `stock_movements`' posture: a
mistake gets a correcting entry, not an edit.
- `amount_paid` for an invoice is always `SUM(amount)` over this table, never
  a stored balance ("ledger, not totals").
- Trigger `recompute_deposit_invoice_status` (AFTER INSERT) sums payments for
  the invoice and sets `deposit_invoices.status`: `pending_deposit` if
  paid = 0, `partially_paid` if `0 < paid < deposit_amount`, `paid` if
  `paid >= deposit_amount`. A second trigger,
  `mirror_deposit_invoice_status`, then mirrors that status onto
  `sales_orders.payment_status`.

### quotations.deposit_paid_on → auto-created Sales Order  *(Sixth pass)*
The first time a Quotation's `deposit_paid_on` transitions from `null` to a
date (`markPaid` in `src/lib/actions/quotations.ts`, gated by
`shouldCreateSalesOrderFromQuotation` so it only fires once per quotation —
`src/lib/domain/sales.ts`), the app auto-creates a Draft `sales_orders` row
linked via `quotation_id`:
- **Customer**: uses `quotations.customer_id` if already linked; otherwise
  looks for an existing `customers` row whose `name` matches
  `quotations.customer_name` case-insensitively (`findMatchingCustomerId`),
  and only creates a new `customers` row if nothing matches. Either way, the
  resolved/created `customer_id` is also written back onto the quotation.
- **Line items**: NONE — created empty (see `sales_order_items` above for why
  this is even possible now). Quotation line items are free-text
  (`description`/`wire_dia`/`steel_grade`); Sales Order line items need a
  real catalog `sku_id` + `location_id`, which nothing can reliably infer from
  free text. The Sales Order detail page shows the quotation's items as a
  read-only reference table so a human can pick the matching SKU per line via
  `addSalesOrderItem`.
- **Failure handling**: this is a best-effort side effect of recording that
  the deposit was paid — if customer/order creation fails partway, the
  deposit-paid write is NOT rolled back (the user's actual action already
  succeeded); the failure is surfaced in the action's response message
  instead, and there is no automatic retry.

### payroll_runs  *(Fourth pass)*
`id`, `period_start`, `period_end`, `pay_date`, `status`, `notes`,
`created_by → profiles`, `approved_by → profiles`, `approved_at`, `paid_at`,
`cancelled_at`, `created_at`, `updated_at`.
- Trigger `enforce_payroll_run_immutable`: once `status <> 'draft'`,
  `period_start`/`period_end`/`pay_date` can no longer change. It is ALSO the
  sole enforcement point for "only an Owner may approve" — on the specific
  `draft → approved` transition it checks `auth_role() = 'owner'` and raises
  `PAYROLL_APPROVE_OWNER_ONLY` otherwise, mirroring the negative-stock /
  over-receipt / over-delivery owner-override pattern.
- A run may be cancelled from `draft` or `approved` (not `paid`, which is
  terminal) — this never deletes anything, matching PO/SO cancellation.

### payroll_items  *(Fourth pass — one payslip line per employee per run)*
`id`, `payroll_run_id → payroll_runs` (cascade), `employee_id → employees`
(restrict), `pay_type` (**snapshot**, always `'daily'`), `days_worked`
(snapshot), `rate` (snapshot of `daily_rate`), `base_amount` (snapshot —
`round(rate * days_worked, 2)`), `created_at`. Unique
`(payroll_run_id, employee_id)`.
- Unlike stock/received/delivered quantities, these ARE stored rather than
  purely derived — this is deliberate: a PAID payslip must stay fixed even if
  attendance is later corrected. Reproducibility is satisfied because the
  generation logic itself is deterministic and derived from attendance + pay
  rates at that moment (AGENTS.md "reproducible from approved attendance +
  rules" invariant) — once paid, nothing can change.
- Trigger `enforce_payroll_item_immutable` (UPDATE + DELETE) *(widened
  Sixth pass, migration 0028)*: items are freely editable while the parent
  run is `draft` OR `approved`; locked once it's `paid` or `cancelled`. (This
  governs the auto-computed columns here — `payroll_item_lines`, the
  human-edited deduction/advance lines, is a separate trigger and stayed
  `draft`-only; see below.)
- **View `payroll_items_live`** *(migration 0026)*: recomputes
  `days_worked`/`rate`/`base_amount`/`overtime_amount` fresh from CURRENT
  `attendance`/`employee_private`/`overtime_entries`, mirroring
  `create_draft_payroll_run`'s formula exactly. The app
  (`buildPayrollRunRows`, `src/lib/domain/payroll-view.ts`,
  `isPayrollLive()`) reads this view for items whose run is `draft` OR
  `approved` and overlays it onto the stored snapshot, so a run left open
  across several days — including after Owner sign-off — reflects each day's
  attendance instead of silently going stale. The moment a run is `paid` (or
  `cancelled`) this view is no longer consulted; the stored columns become
  the permanent record.
- **Function `pay_payroll_run(p_run_id)`** *(migration 0028; supersedes
  0026's `approve_payroll_run`, now dropped)* — what `markPayrollRunPaid`
  calls (`src/lib/actions/payroll.ts`). In one transaction it (1) writes the
  CURRENT `payroll_items_live` figures into `payroll_items` for that run —
  the last write the immutability trigger allows while `status = 'approved'`
  — then (2) flips `payroll_runs.status` to `'paid'`. This is the actual
  freeze point now: a run stays live all the way through Draft and Approved
  (Approve is just the Owner sign-off checkpoint, still enforced by
  `enforce_payroll_run_immutable`, no longer a data freeze), so marking Paid
  is what needs to capture "whatever the Payroll Admin was looking at" —
  without it, paying would silently discard every attendance/overtime
  correction recorded since generation.

### payroll_item_lines  *(Fourth pass — deductions / advances)*
`id`, `payroll_item_id → payroll_items` (cascade), `kind`
(`deduction`/`advance`), `label`, `amount` (> 0), `created_at`. Simple named
line items — no cross-period running balance (an "advance" here is just a
line on this run, not tracked as a loan against future runs).
- Trigger `enforce_payroll_item_line_immutable` (INSERT + UPDATE + DELETE):
  locked once the parent run leaves `draft` — new lines cannot even be added
  to an approved run; corrections require a new run.
- **View `payroll_item_deductions`** = `SUM(amount)` grouped by
  `payroll_item_id` — the deductions total is NEVER stored, same "derive,
  don't store" pattern as `stock_balances` / `purchase_order_item_received` /
  `sales_order_item_delivered`. Net pay = `base_amount − deductions_total`,
  computed in `buildPayrollRunRows` (`src/lib/domain/payroll-view.ts`).

## RLS matrix (summary)

| Table | Read | Write |
| --- | --- | --- |
| profiles | self; owner/system_admin all | owner/system_admin |
| locations / product_families / skus | all authenticated | owner/system_admin |
| stock_movements | owner/system_admin/warehouse/sales/viewer | insert: owner/system_admin/warehouse/sales · no update/delete |
| employees | owner/system_admin/payroll/attendance/viewer | owner/system_admin |
| **employee_private** | **owner/system_admin/payroll** | **owner/system_admin/payroll** |
| attendance | owner/system_admin/attendance/payroll/viewer | insert/update: owner/system_admin/attendance · no delete |
| attendance_groups | all authenticated | owner/system_admin |
| audit_log | owner/system_admin | insert: any authenticated · no update/delete |
| sent_reports | owner/system_admin | insert: owner/system_admin (+ service role) |
| telegram_settings | owner/system_admin | owner/system_admin |
| suppliers / purchase_orders / purchase_order_manual_items | owner/system_admin/warehouse | owner/warehouse (system_admin is view-only). `purchase_order_items` has the same RLS but is dormant — the app no longer writes to it. |
| customers / sales_orders / sales_order_items | owner/system_admin/sales | owner/sales (system_admin is view-only — this is also what keeps prices, which live on these same rows, out of every other role) |
| payroll_runs / payroll_items / payroll_item_lines | owner/system_admin/payroll | owner/payroll (system_admin is view-only — approving a run additionally requires Owner specifically, enforced by a DB trigger) |

Storage buckets (all **private**): `employee-photos`, `employee-docs` — read by
owner/system_admin/payroll, write by owner/system_admin; `attachments` — read by
warehouse/sales/admins/viewer, write by warehouse/sales/admins.

## Functions

- `auth_role()` — role of `auth.uid()` (used by RLS + triggers).
- `enforce_stock_rules()` — non-negative guard with Owner override.
- `prevent_update()` / `prevent_delete()` — append-only / no-hard-delete guards.
- `post_stock_transfer(p_sku, p_from, p_to, p_qty, p_business_date, p_notes)` —
  atomic transfer_out/transfer_in pair (RLS-respecting).
- `handle_new_user()` — auto-create profile; first user ⇒ Owner.
- `set_updated_at()` — maintains `updated_at`.
- `set_my_locale(p_locale)` — lets a signed-in user set ONLY their own `locale`
  (SECURITY DEFINER; avoids a broad self-update policy that would expose `role`).
- `owner_exists()` — anon-callable boolean guard for the setup/bootstrap flow.
  First-Owner setup is allowed only while this is false; public self-signup is
  disabled (`enable_signup=false` in config.toml), so later users are created
  only by an Owner via the service-role admin API (Settings → Users).
- `assign_po_number()` — atomic `PO-YYYY-####` counter, resets per calendar year.
- `enforce_po_header_immutable()` — locks PO commercial terms once issued
  (Draft is the only editable state). Its sibling `enforce_po_item_immutable()`,
  and the RPCs `create_draft_purchase_order(...)`/`post_purchase_receipt(...)`,
  are **dormant** — nothing in the app calls them now that Purchasing is
  header-only; `createDraftPurchaseOrder` does a plain insert into
  `purchase_orders` instead.
- `assign_so_number()` — atomic `SO-YYYY-####` counter, resets per calendar year.
- `enforce_so_header_immutable()` / `enforce_so_item_immutable()` — lock SO
  commercial terms/items once confirmed (Draft is the only editable state).
- `enforce_sale_delivery_rules()` — blocks delivering against a draft/
  cancelled SO, and blocks over-delivery without an Owner override + reason.
- `create_draft_sales_order(...)` — atomic header + all line items in one call
  (`SECURITY INVOKER`; RLS still governs who may call it).
- `post_sale_delivery(...)` — atomic: inserts the `sale_delivery` movement
  (stored negative), then recomputes `sales_orders.status` from the ledger.
- `enforce_payroll_run_immutable()` — locks period/pay dates once a run
  leaves Draft; also the sole gate requiring Owner for the `draft →
  approved` transition specifically (`PAYROLL_APPROVE_OWNER_ONLY`).
- `enforce_payroll_item_immutable()` / `enforce_payroll_item_line_immutable()`
  — lock payslip items and their deduction/advance lines once the parent run
  leaves Draft.
- `create_draft_payroll_run(p_period_start, p_period_end, p_pay_date, p_notes)`
  — atomic: one `payroll_items` row per active employee, with `base_amount =
  daily_rate × distinct present/late attendance dates in the period`.
  `SECURITY INVOKER`; RLS on
  `payroll_runs`/`payroll_items`/`employee_private`/`attendance` still
  governs who may call it and what it can see.
