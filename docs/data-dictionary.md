# Data Dictionary — Zysteel Operations

Source of truth: `supabase/migrations/*.sql`. Update this file in the same change
whenever the schema changes (AGENTS.md rule 5).

## Enums & controlled values

- **Roles** (`app_role`): `owner`, `system_admin`, `attendance_admin`,
  `warehouse_admin`, `sales_admin`, `payroll_admin`, `viewer`.
- **Movement types**: `opening_balance`, `purchase_receipt`, `production_output`,
  `sale_delivery`, `other_stock_out`, `adjustment`, `transfer_out`, `transfer_in`.
- **Purchase order status**: `draft`, `ordered`, `partially_received`, `received`,
  `cancelled`. **Sales order status**: `draft`, `confirmed`, `partially_delivered`,
  `delivered`, `cancelled`. **Currencies**: `USD`, `KHR`, `CNY` (one per PO/SO, no
  conversion).
- **Conditions**: `normal` (正常), `old` (旧), `rough_edge` (错毛边), `damaged` (损坏).
- **Attendance status**: `present`, `late`, `leave`, `absent` (+ derived `unmarked`).
  In the grouped Telegram report "实到" (actual present) = present + late; exception
  sections render as 请假 (leave) · 缺勤 (absent) · 迟到 (late) · 未打卡 (unmarked).
- **Shift**: `morning`, `afternoon`. **Pay type**: `monthly`, `daily`.
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
- Trigger `enforce_purchase_receipt_rules` (Second pass) blocks receiving against
  a draft/cancelled PO, and blocks over-receipt (received > ordered on that item)
  unless Owner + a recorded reason — the same shape as the negative-stock guard.
- Trigger `enforce_sale_delivery_rules` (Third pass) is the mirror image: blocks
  delivering against a draft/cancelled SO, and blocks over-delivery (delivered >
  ordered on that item) unless Owner + a recorded reason.
- Triggers block UPDATE and DELETE (append-only).
- **View `stock_balances`** = `SUM(quantity)` grouped by `sku_id, location_id`
  (`security_invoker`, so RLS applies).
- **View `purchase_order_item_received`** = `SUM(quantity)` of `purchase_receipt`
  rows grouped by `purchase_order_item_id` — received/outstanding quantity is
  NEVER stored, exactly like stock itself.
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
`start_date`, `is_active`, `pay_type`, `photo_path`, `notes`, `created_at`.
The `assign_employee_identity` BEFORE INSERT trigger sets `seq_no`,
`employee_code = 'ZY-' || lpad(seq_no,4,'0')`, and defaults `employee_number` to
`seq_no` (so reports can show `7号`). Employee IDs are **never entered by the
client** and never reused, even after archiving.
Report/grouping fields (added in 0005): `attendance_group_id → attendance_groups`,
`employee_number` (e.g. "7" → renders "7号"), `display_name`, `job_title`,
`label` (optional, e.g. 备用).

### employee_private  *(SENSITIVE)*
`employee_id → employees (PK)`, `base_salary`, `daily_rate`, `emergency_contact`,
`updated_at`. RLS: Owner / System Admin / Payroll Admin only.

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
Asia/Phnom_Penh, checked by `telegram_settings_times_chk`; the scheduler reads
them dynamically. `report_language` (`'en'`/`'zh'`, default `'zh'` — future-ready;
the attendance report is currently always sent in Chinese), `updated_at`.

### suppliers  *(editable master data, Second pass)*
`id`, `name`, `name_chinese`, `name_english`, `contact_person`, `phone`,
`address`, `tax_id`, `payment_terms`, `default_currency` (`USD`/`KHR`/`CNY`),
`notes`, `is_active`, `created_at`, `updated_at`. Referenced by
`purchase_orders.supplier_id` `ON DELETE RESTRICT` — a supplier with any
purchase history cannot be hard-deleted (archive instead); `deleteSupplier`
pre-checks this and the FK is the backstop.

### purchase_orders  *(Second pass)*
`id`, `po_number` (unique, auto `PO-YYYY-####` — atomic per-calendar-year
counter via `purchase_order_seq` + `assign_po_number` trigger), `supplier_id →
suppliers`, `order_date`, `expected_arrival_date`, `currency`, `status`,
`notes`, `attachment_path`, `created_by → profiles`, `issued_at`,
`cancelled_at`, `created_at`, `updated_at`.
- One currency per PO; no exchange-rate conversion.
- Trigger `enforce_po_header_immutable`: once `status <> 'draft'`, `supplier_id`
  /`currency`/`order_date` can no longer change (`expected_arrival_date`,
  `notes`, `attachment_path`, `status` remain editable — suppliers revise ETAs).
- `status` is the one purchasing field that IS stored (not derived): set by the
  app on Issue/Cancel, and recomputed by `post_purchase_receipt` after each
  receipt from `SUM(ordered) vs SUM(received)` across all of the PO's items.

### purchase_order_items  *(Second pass)*
`id`, `purchase_order_id → purchase_orders` (cascade), `sku_id → skus`,
`location_id → locations` (where this line receives into), `unit` (copied from
the SKU at insert time — never user-chosen, so there is no unit-conversion path
to get wrong), `ordered_qty`, `unit_cost`, `line_total` (**generated always as**
`ordered_qty * unit_cost`). Received/outstanding quantity is derived, never
stored (see `purchase_order_item_received` above).
- Triggers `enforce_po_item_immutable` (UPDATE + DELETE): items are freely
  editable while the parent PO is `draft`; once issued they are permanently
  immutable, matching the ledger's append-only philosophy.

### customers  *(editable master data, Third pass)*
`id`, `name`, `name_chinese`, `name_english`, `contact_person`, `phone`,
`address`, `tax_id`, `payment_terms`, `default_currency` (`USD`/`KHR`/`CNY`),
`notes`, `is_active`, `created_at`, `updated_at`. Referenced by
`sales_orders.customer_id` `ON DELETE RESTRICT` — a customer with any sales
history cannot be hard-deleted (archive instead); `deleteCustomer` pre-checks
this and the FK is the backstop.

### sales_orders  *(Third pass)*
`id`, `so_number` (unique, auto `SO-YYYY-####` — atomic per-calendar-year
counter via `sales_order_seq` + `assign_so_number` trigger), `customer_id →
customers`, `order_date`, `expected_delivery_date`, `currency`, `status`,
`notes`, `attachment_path`, `created_by → profiles`, `confirmed_at`,
`cancelled_at`, `created_at`, `updated_at`.
- One currency per SO; no exchange-rate conversion.
- Trigger `enforce_so_header_immutable`: once `status <> 'draft'`, `customer_id`
  /`currency`/`order_date` can no longer change (`expected_delivery_date`,
  `notes`, `attachment_path`, `status` remain editable — delivery dates slip).
- `status` is the one sales field that IS stored (not derived): set by the app
  on Confirm/Cancel, and recomputed by `post_sale_delivery` after each delivery
  from `SUM(ordered) vs SUM(delivered)` across all of the SO's items.

### sales_order_items  *(Third pass)*
`id`, `sales_order_id → sales_orders` (cascade), `sku_id → skus`,
`location_id → locations` (which location this line delivers out of), `unit`
(copied from the SKU at insert time — never user-chosen, so there is no
unit-conversion path to get wrong), `ordered_qty`, `unit_price`, `line_total`
(**generated always as** `ordered_qty * unit_price`). Delivered/outstanding
quantity is derived, never stored (see `sales_order_item_delivered` above).
- Triggers `enforce_so_item_immutable` (UPDATE + DELETE): items are freely
  editable while the parent SO is `draft`; once confirmed they are permanently
  immutable, matching the ledger's append-only philosophy.

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
(restrict), `pay_type` (**snapshot** of the employee's pay_type at generation
time), `days_worked` (snapshot, null for monthly employees), `rate` (snapshot
of `base_salary`/`daily_rate`), `base_amount` (snapshot — monthly = `rate`;
daily = `round(rate * days_worked, 2)`), `created_at`. Unique
`(payroll_run_id, employee_id)`.
- Unlike stock/received/delivered quantities, these ARE stored rather than
  purely derived — this is deliberate: an APPROVED payslip must stay fixed
  even if attendance is later corrected. Reproducibility is satisfied because
  the generation logic itself is deterministic and derived from
  attendance + pay rates at that moment (AGENTS.md "reproducible from approved
  attendance + rules" invariant) — a draft run can always be discarded
  (cancelled) and regenerated to pick up corrections; once approved, nothing
  can change.
- Trigger `enforce_payroll_item_immutable` (UPDATE + DELETE): items are
  freely editable while the parent run is `draft`; locked once it leaves
  draft.

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
| suppliers / purchase_orders / purchase_order_items | owner/system_admin/warehouse | owner/warehouse (system_admin is view-only — this is also what keeps costs, which live on these same rows, out of every other role) |
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
- `enforce_po_header_immutable()` / `enforce_po_item_immutable()` — lock PO
  commercial terms/items once issued (Draft is the only editable state).
- `enforce_purchase_receipt_rules()` — blocks receiving against a draft/
  cancelled PO, and blocks over-receipt without an Owner override + reason.
- `create_draft_purchase_order(...)` — atomic header + all line items in one
  call (`SECURITY INVOKER`; RLS still governs who may call it).
- `post_purchase_receipt(...)` — atomic: inserts the `purchase_receipt`
  movement, then recomputes `purchase_orders.status` from the ledger.
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
  — atomic: one `payroll_items` row per active employee, with `base_amount`
  computed from `employee_private` (monthly) or `daily_rate × distinct
  present/late attendance dates in the period` (daily). `SECURITY INVOKER`;
  RLS on `payroll_runs`/`payroll_items`/`employee_private`/`attendance` still
  governs who may call it and what it can see.
