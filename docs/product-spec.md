# Product Spec — Zysteel Operations

## Purpose

A single operational system for Zysteel (中粤铁网) covering the work the business
does every day: recording **attendance**, tracking **inventory** as an auditable
ledger, and pushing **Telegram** reports to the team. Built to be extended, in
phased passes, into purchasing, sales, and payroll.

## Users & roles

Role-based access control (see `docs/data-dictionary.md` for the full matrix):

- **Owner** — full access, approvals, the only role that may override negative stock.
- **System Admin** — settings, users, employees, product master data, Telegram
  config; views (not manage) suppliers/purchase orders, including costs.
- **Attendance Admin** — daily attendance entry & correction; send attendance reports.
- **Warehouse Admin** — inventory: opening/production/stock-out/adjustment/
  transfer; suppliers and purchase orders (create, issue, cancel — header-only
  records, no receiving), no approval workflow.
- **Sales Admin** — customers, sales orders (create, confirm, deliver), no
  approval workflow; read inventory.
- **Payroll Admin** — generates/manages payroll runs, deduction/advance lines
  (not approval — Owner only); reads sensitive employee data.
- **Viewer** — dashboard & reports only.

## Localisation

- Bilingual UI: **中文 (default)** and **English**, toggled in the top bar.
- Product-domain terms (钢筋网, 螺纹盘圆, 拔丝料, units 张 / 捆, conditions 旧 /
  错毛边) render verbatim in both languages.
- **Khmer** employee names render with a Khmer font stack.
- Dates display as **dd/mm/yyyy**. All schedules/times use **Asia/Bangkok**.

## First pass — Operations MVP (this release)

1. **Engineering harness** — docs, `npm run verify`, CI, `.env.example`, tests.
2. **Brand & foundation** — 中粤铁网 red/charcoal industrial UI, auth, roles,
   immutable audit log, responsive shell, dashboard.
3. **Settings / master data** — editable **locations** (Storage Room, Warehouse),
   editable **product families** (钢筋网 / 螺纹盘圆 / 拔丝料), editable
   **specifications** with attributes, units, conditions, and minimum-stock
   levels. Seeded with the supplied example stock.
4. **Employees & attendance** — profiles with private photos; manual morning &
   afternoon entry; bulk "mark present" + per-employee exceptions; unmarked
   warning; attendance dashboard; Telegram "Send now" + scheduled 08:00 / 13:00.
5. **Core inventory** — append-only ledger (opening / production / stock-out /
   adjustment / Storage↔Warehouse transfer); live stock by spec, condition,
   location, and total; negative-stock block with Owner override; inventory
   dashboard + daily Telegram report.
6. **Verification** — automated tests for the acceptance criteria; `npm run
   verify` green.

Full Reports remains a **navigation placeholder** in this pass. Purchasing
(Second pass), Sales (Third pass), and Payroll (Fourth pass, below) are now
built.

## Inventory model (core)

- Two editable stock locations: **Storage Room (仓房)** and **Warehouse (仓库)**.
- Product families and specifications are **editable master data**, never
  hard-coded. For **钢筋网** each unique combination of *family · diameter · size ·
  hole · optional rod count · condition · unit* is a distinct SKU. **拔丝料**
  supports decimal 捆 quantities (e.g. 30.5). **螺纹盘圆** specs/units are fully
  configurable.
- Stock is an **append-only ledger**. Balance = `Σ quantity`:
  `opening_balance + purchase_receipt + production_output + transfer_in
   − sale_delivery − other_stock_out − transfer_out ± adjustment`.
- **Transfers** create a matching out/in pair; company total is invariant.
- **Negative stock** is blocked unless an **Owner** overrides with a recorded
  reason.

Seeded opening stock (Storage Room): 拔丝料 10厘 = 10 捆; 拔丝料 6厘 = 30.5 捆;
钢筋网 9厘|3×6|20孔|Normal = 329 张; 9厘|3×6|20孔|旧 = 64 张;
5.5厘|3×6|20孔|15根|Normal = 903 张; 5.5厘|3×6|20孔|14根|错毛边 = 146 张;
3.3厘|2×6|20孔|Normal = 902 张.

## Attendance model

- Two manual shifts per business day: **morning** (~07:30) and **afternoon**
  (~12:30). Statuses: Present, Late, Leave, Absent, plus **Unmarked** for anyone
  without a record.
- One record per (employee, business_date, shift). Admin bulk-marks Present, then
  edits exceptions. Unmarked employees are flagged before a report is sent.
- Reports: morning at **08:00**, afternoon at **13:00** (Asia/Bangkok), with
  totals + exceptions. Admin can resend a corrected report. Scheduled sends are
  idempotent (no duplicates).

## Roadmap (later passes)

- **Second pass — Purchasing (built, later simplified to header-only):**
  suppliers, purchase orders (USD/KHR/CNY, `PO-YYYY-####`, Draft → Ordered →
  Cancelled). Purchase orders are records that an order was placed — supplier,
  dates, currency, notes, attachment — with no line items, no quantities, no
  costs, and no structured receiving; nothing about a purchase updates
  inventory automatically. (Line items + goods receiving + an over-receipt
  guard were originally built, mirroring Sales below, then deliberately
  removed at the user's request — the underlying DB tables/triggers/RPCs
  remain in the schema, dormant, since migrations are additive-only; see
  `docs/data-dictionary.md`.) Costs restricted to Owner/System Admin/Warehouse
  Admin. The Telegram inventory report does not include supplier/PO
  information — see `docs/data-dictionary.md` and `docs/test-plan.md` for the
  schema and tests. Overdue/Expected Arrival Date tracking (a per-PO ETA
  field plus an overdue badge/dashboard stat, mirroring Sales' delivery-date
  tracking) was also built and then removed at the user's request — same
  dormant-column posture as above (`expected_arrival_date` stays in the
  `purchase_orders` table, unused).
- **Third pass — Sales (built):** customers, sales orders (USD/KHR/CNY,
  `SO-YYYY-####`, Draft → Confirmed → Partially Delivered/Delivered/Cancelled),
  delivery from a location (creates `sale_delivery`, immutable ledger,
  stored negative), over-delivery blocked without Owner override, and a Sales
  dashboard (open/overdue/due-this-week/partially-delivered, ordered vs.
  delivered, committed stock = physical − outstanding ordered). Prices
  restricted to Owner/System Admin/Sales Admin. No Telegram sales section (by
  design, mirroring the decision to keep Purchasing's Telegram section off) —
  see `docs/data-dictionary.md` and `docs/test-plan.md` for the schema and
  tests.
- **Fourth pass — Payroll (built):** payroll runs over a period (default
  semi-monthly, 1st–15th / 16th–end), Draft → Approved → Paid/Cancelled.
  Every employee is paid daily (`pay_type` is constrained to `'daily'` —
  monthly-salary pay was removed, see migration 0016); generating a draft
  snapshots one payslip per active employee as `daily_rate × count(DISTINCT
  business dates with a 'present' or 'late' attendance row in the period)` —
  a day with either shift marked present/late counts once, never
  double-counted across morning + afternoon. Deductions/advances are simple
  named line items per payslip (no cross-period running balance). USD only —
  no currency field, matching `employee_private`. Only Draft is editable;
  **Approved is permanently immutable and requires an Owner** (enforced by
  the app AND a DB trigger as the ultimate authority — belt & suspenders,
  same shape as the negative-stock and over-receipt/over-delivery guards).
  No bank payments (Paid is a bookkeeping marker only). Salary figures are
  restricted to Owner/System Admin/Payroll Admin and are **never written to
  the audit log** (only metadata like status transitions and line
  labels/kinds — see AGENTS.md). These rules (worked-day counting, currency,
  deduction structure) were explicit product decisions, not inferred — see
  `docs/data-dictionary.md` and `docs/test-plan.md` for the schema and tests.
  Deduction/advance lines and period/pay dates are editable only while
  **Draft**; **Approving still requires an Owner** (enforced by the app AND
  a DB trigger as the ultimate authority — belt & suspenders, same shape as
  the negative-stock and over-receipt/over-delivery guards), but Approve is
  a sign-off checkpoint, not a data freeze (see below). No bank payments
  (Paid is a bookkeeping marker only). Salary figures are restricted to
  Owner/System Admin/Payroll Admin and are **never written to the audit
  log** (only metadata like status transitions and line labels/kinds — see
  AGENTS.md).
  A run's days-worked/base/overtime figures are **live** — recomputed from
  current attendance and overtime on every page load via the
  `payroll_items_live` view — through BOTH Draft and Approved (migration
  0026, widened Sixth pass in 0028), so a run left open across several days,
  even after Owner sign-off, reflects each day's attendance instead of
  freezing at generation or approval time. **Paid is the actual freeze
  point**: marking a run Paid snapshots the CURRENT live figures into the
  stored columns as its last step before flipping status (the
  `pay_payroll_run` RPC, which superseded 0026's `approve_payroll_run`) — so
  the permanently-immutable record is what was on screen when it was paid,
  not stale generation-time numbers. This was an explicit product decision,
  not an oversight: freezing at Approve turned out to lock pay in too early
  (attendance/overtime recorded between Approve and payday should still
  count), so the freeze point moved to Paid.
- **Fifth pass — Sales Order Deposit Invoices (built):** a confirmed sales
  order can generate one active `Deposit Invoice` for a chosen percentage
  (10/30/50/custom) of its total. Sales order line items got an optional
  per-m² pricing breakdown (Area/sheet, Price/m²) so the invoice can show
  Price/m² × Area/sheet = Price/sheet alongside the total, deposit amount,
  and remaining balance; `unit_price` stays the stored source of truth
  either way. The invoice is printable (self-contained HTML → browser Save
  as PDF, same pattern as the Customer Price Inquiry report). Payment status
  (Pending Deposit → Partially Paid → Paid) is a new field on the sales
  order, orthogonal to its delivery-tracking status, and is always derived
  from an append-only payments ledger — never hand-set — via "Record
  Payment" (amount + date). Reuses `sales:manage`, no new permission — see
  `docs/data-dictionary.md` and `docs/test-plan.md` for the schema and tests.
- **Sixth pass — Quotation deposit → Sales Order (built):** the first time a
  Quotation's deposit is marked paid, the app auto-creates a linked Draft
  Sales Order (customer resolved-or-created from the quotation's name/contact,
  currency, and a traceability note — see `docs/data-dictionary.md`'s
  "quotations.deposit_paid_on → auto-created Sales Order" for the exact
  resolution rules). It starts with **zero line items** by design: a
  quotation's lines are free text, while a Sales Order's lines need a real
  catalog SKU + warehouse, which nothing can safely guess from text. A human
  completes it via a new "Add item" action on the Sales Order (SKU/location
  picker, with the quotation's original lines shown alongside as a reference),
  and confirming the order is now blocked until it has at least one item — a
  rule that used to be enforced at creation time and moved to confirm time to
  make the empty-Draft-then-fill-in-by-hand flow possible. Both records show a
  cross-link once connected. Reuses `sales:manage`, no new permission.

## Explicit non-goals (v1)

- No automatic raw-material consumption from production (documented future BOM).
- No bank payments in payroll.
- No purchasing/sales/payroll workflows in the first pass.
