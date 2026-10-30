# Test Plan — Zysteel Operations

## How verification works

`npm run verify` is the single gate. It runs, stopping at the first failure:

1. **format** — `prettier --check`
2. **lint** — `next lint`
3. **typecheck** — `tsc --noEmit`
4. **test** — Vitest unit + integration (`tests/unit`, `tests/integration`)
5. **schema** — `scripts/validate-schema.mjs` (static; with `SUPABASE_DB_URL`,
   it only confirms the database is reachable and never replays migrations)
6. **build** — `next build`
7. **e2e** — Playwright critical flows. Runs automatically whenever
   `NEXT_PUBLIC_SUPABASE_URL` is reachable and `SUPABASE_SERVICE_ROLE_KEY` is
   set (no flag needed); otherwise it's skipped with a message. Set
   `REQUIRE_E2E=1` to make a not-ready Supabase a hard failure instead of a
   skip (see `scripts/verify.mjs`).

CI's `verify` job has no database, so e2e auto-skips there and the job stays
green on steps 1–6 alone. A second CI job, `e2e`, boots a real local Supabase
(`supabase start` + `db reset`), exports its env, installs the Playwright
browser, then runs the full `npm run verify` with `REQUIRE_E2E=1` so it fails
loudly instead of silently skipping — see `.github/workflows/ci.yml`. Locally,
just have `supabase start` running before `npm run verify`.

## Test layers

- **Unit** (`tests/unit`): pure domain logic — the business rules. Fast, no I/O.
- **Integration** (`tests/integration`): multi-step domain scenarios (full ledger
  flow, report rendering, Telegram idempotency with the mock client + in-memory
  store).
- **E2E** (`tests/e2e`): 14 spec files (22 scenarios) as of 2026-10-16 — a
  couple of unauthenticated smoke flows (routing, login/setup render) that
  pass with or without a backend, plus authenticated flows per module
  (attendance, sales, payroll, deposit invoices, inventory
  report/SKU, product families, login history, telegram settings, transfer,
  employee create, report preview) that sign in as a seeded test Owner via
  `tests/e2e/global-setup.ts` against local Supabase.

## Acceptance criteria → tests

| # | Criterion | Covered by |
| --- | --- | --- |
| 1 | Admin creates a product specification | `tests/unit/products.test.ts` (label + uniqueness signature); action `createSku` |
| 2 | Historical purchased stock remains in Storage Room balances after retirement | `tests/unit/stock-ledger.test.ts` (purchase_receipt increases only that SKU/location) |
| 3 | Transfer Storage→Warehouse; company total unchanged | `tests/unit/stock-ledger.test.ts` + `tests/integration/stock-flows.test.ts` (invariant) |
| 4 | Production increases only the selected 钢筋网 SKU | `tests/unit/stock-ledger.test.ts`; `tests/integration/stock-flows.test.ts` |
| 5 | Confirmed sale delivery decreases only the correct SKU + location | `tests/unit/stock-ledger.test.ts` |
| 6 | Negative stock blocked without Owner override | `tests/unit/stock-ledger.test.ts` (`evaluateNegativeGuard`); DB trigger `enforce_stock_rules`; schema check |
| 7 | Morning & afternoon reports aggregate correctly | `tests/unit/attendance.test.ts`; `tests/integration/reports-render.test.ts` |
| 8 | Telegram scheduled send does not duplicate a report | `tests/integration/telegram-idempotency.test.ts` |
| 9 | Payroll draft reads attendance & respects the confirmed pay rules | `tests/unit/payroll.test.ts`; `tests/integration/payroll-flows.test.ts`; DB function `create_draft_payroll_run` |
| 10 | Unauthorized users cannot access salary / private photos | `tests/unit/rbac.test.ts` (sensitive-data matrix); RLS on `employee_private` + private Storage buckets; schema check |
| 11 | Purchasing navigation and dashboard cards removed | `tests/integration/purchasing-removal.test.ts`; `tests/e2e/purchasing-removal.spec.ts`; PostgreSQL migration verification |
| 12 | Purchasing pages, export/PDF endpoints and actions removed | `tests/integration/purchasing-removal.test.ts`; `tests/e2e/purchasing-removal.spec.ts`; PostgreSQL migration verification |
| 13 | Purchasing tables/RPCs removed after restricted audit snapshots; ledger preserved | `tests/integration/purchasing-removal.test.ts`; `tests/e2e/purchasing-removal.spec.ts`; PostgreSQL migration verification |
| 14 | Telegram inventory report never includes supplier/PO/cost information | `tests/integration/reports-render.test.ts` |
| 15 | Create a sales order (draft, header + line items) | `tests/integration/sales-flows.test.ts` |
| 16 | Partial delivery updates status/outstanding, keeps SO open | `tests/unit/sales.test.ts`; `tests/integration/sales-flows.test.ts` |
| 17 | Full delivery marks the SO Delivered | `tests/unit/sales.test.ts`; `tests/integration/sales-flows.test.ts` |
| 18 | Delivery decreases stock only at the selected location | `tests/integration/sales-flows.test.ts` (reuses `stock-ledger` balance helpers) |
| 19 | Over-delivery blocked without an Owner override | `tests/unit/sales.test.ts` (`evaluateOverDeliveryGuard`); DB trigger `enforce_sale_delivery_rules`; schema check |
| 20 | A cancelled SO cannot be delivered against | `tests/unit/sales.test.ts` (`canDeliverAgainst`); DB trigger `enforce_sale_delivery_rules`; schema check |
| 21 | Sales order prices visible only to Owner/System Admin/Sales Admin | `tests/unit/rbac.test.ts`; RLS on `customers`/`sales_orders`/`sales_order_items`; schema check |
| 22 | Committed stock = physical − outstanding ordered, kept separate from physical | `tests/unit/sales.test.ts` (`computeCommittedStock`) |
| 23 | Daily-rate pay = daily_rate × distinct present/late attendance dates (not double-counted across shifts) | `tests/unit/payroll.test.ts`; `tests/integration/payroll-flows.test.ts`; DB function `create_draft_payroll_run` |
| 24 | Monthly-salary pay = `base_salary` in full, attendance ignored, `days_worked` null (`pay_type` in `('monthly','daily')` — removed in 0016, restored in 0047) | `tests/integration/payroll-flows.test.ts`; `employees_pay_type_check`/`payroll_items_pay_type_check`; DB function `create_draft_payroll_run` + view `payroll_items_live`; schema check |
| 25 | Net pay = base amount − sum of deduction/advance lines, never a stored total | `tests/unit/payroll.test.ts` (`computeNetAmount`); view `payroll_item_deductions` |
| 26 | A payroll run can only be approved by an Owner | `tests/unit/rbac.test.ts`; DB trigger `enforce_payroll_run_immutable` (`PAYROLL_APPROVE_OWNER_ONLY`); schema check |
| 27 | Deduction/advance lines and run dates are only editable while Draft; a Paid (or Cancelled) payroll run's items are permanently immutable | `tests/unit/payroll.test.ts` (`canEditRun`, `isPayrollLive`); `tests/unit/payroll-view.test.ts`; DB triggers `enforce_payroll_item_immutable`/`enforce_payroll_item_line_immutable`; schema check |
| 28 | Payroll figures visible only to Owner/System Admin/Payroll Admin | `tests/unit/rbac.test.ts`; RLS on `payroll_runs`/`payroll_items`/`payroll_item_lines`; schema check |
| 29 | Salary/pay figures are never written to the audit log | `src/lib/actions/payroll.ts` (manual review — every `writeAudit` call omits amounts, matching `actions/employees.ts`'s `saveEmployeePrivate` precedent) |
| 30 | A sales order item's `unit_price` is server-derived from Price/m² × Area/sheet when both are supplied (client value never trusted) | `tests/unit/deposit-invoice.test.ts` (`computeUnitPriceFromArea`); DB function `create_draft_sales_order`; `tests/e2e/deposit-invoice.spec.ts` |
| 31 | A deposit invoice may only be generated for a confirmed SO, and only one active invoice per SO | `tests/unit/deposit-invoice.test.ts` (`canGenerateDepositInvoice`); partial unique index on `deposit_invoices`; schema check |
| 32 | Deposit amount / remaining balance = total × percentage (and its complement) — generated columns, never hand-entered | `tests/unit/deposit-invoice.test.ts` (`computeDepositAmount`/`computeRemainingBalance`); generated columns on `deposit_invoices`; schema check |
| 33 | A deposit invoice's status derives from its payments ledger, never set directly, and mirrors onto the sales order's `payment_status` | `tests/unit/deposit-invoice.test.ts` (`computeDepositInvoiceStatus`); DB triggers `recompute_deposit_invoice_status`/`mirror_deposit_invoice_status`; `tests/e2e/deposit-invoice.spec.ts` |
| 34 | New purchase receipts rejected; historical receipt arithmetic preserved | `tests/integration/purchasing-removal.test.ts`; `tests/e2e/purchasing-removal.spec.ts`; PostgreSQL migration verification |
| 35 | One Sales Order keeps one permanent `so_number` (format `ZYS-{YYYY}Y-###`), but can carry multiple payment receipts (deposit and/or final), each with its own unique, globally-sequential `receipt_number` (format `ZYS-R-######`, never resets per year) and clearly tagged type — all linked to the same SO, no new SO or order number ever created by a payment | `tests/unit/payment-receipt.test.ts`; `tests/e2e/deposit-invoice.spec.ts` (asserts the `ZYS-{YYYY}Y-###`/`ZYS-R-######` formats); DB functions `assign_so_number`/`assign_receipt_number`; schema check |
| 35a | Sales Orders list can be filtered by order number, customer name, or date | `src/app/(app)/sales/orders/orders-list.tsx` (client-side filter, same pattern as `employees-client.tsx`) — manual/browser verification, no automated test |
| 36 | A final payment can only be recorded once the deposit invoice is fully paid, and any number of partial final payments are allowed until the balance reaches zero | `tests/unit/payment-receipt.test.ts` (`canRecordFinalPayment`); DB trigger `enforce_payment_receipt_rules` (`FINAL_PAYMENT_REQUIRES_PAID_DEPOSIT`); `tests/e2e/deposit-invoice.spec.ts` |
| 37 | The sum of every payment receipt (deposit + final) against a Sales Order can never exceed its total — enforced for real, not just by the UI | `tests/unit/payment-receipt.test.ts` (`wouldExceedSoTotal`); DB trigger `enforce_payment_receipt_rules` (`PAYMENT_EXCEEDS_SO_TOTAL`); schema check |
| 38 | Every successful sign-in records one login_events row (who, when, IP, country/city), visible only to Owner/System Admin | `tests/unit/login-event.test.ts` (`parseClientIp`); `tests/e2e/login-history.spec.ts`; RLS on `login_events`; schema check |

| 39 | Wire Mesh drawings prefill compatible quotation/order data for review, require exact spacing fits, derive counts/areas, persist/reopen, and expose printable export | `tests/unit/wire-mesh.test.ts`; `tests/unit/wire-mesh-prefill.test.ts`; `tests/e2e/wire-mesh-drawings.spec.ts`; schema check |

Additional coverage: `tests/unit/datetime.test.ts` (Asia/Bangkok ⇄ UTC,
dd/mm/yyyy, business-date boundary), `tests/unit/inventory-view.test.ts`
(Storage/Warehouse/total split + low-stock).

## Dashboard permission boundaries — acceptance #42 (P9 first fix)

For all eight roles, dashboard attendance and stock sections must authorize both
reads and rendering using existing module grants. Viewer keeps both; denied
domains must start no requests and display no misleading zeros/exceptions.
Production entry still requires stock:production and a warehouse location.

`tests/integration/dashboard-permissions.test.ts` renders the actual Server
Component, checks every source helper and section, sequential role changes,
failed user guard, both locales and entry permissions. The existing RBAC unit
tests retain the canonical grant matrix. `dashboard-request-cost.test.ts` uses
real Supabase query builders/intercepted transport to verify per-role request
budgets; these are not live speed or effective-RLS benchmarks.
`tests/e2e/dashboard-permissions.spec.ts` adds eight mobile login/role cases for
the real local stack. Report environment skips separately. P9 audit findings
include existing SQL tests that return early without a backend; their green
Vitest status does not prove SQL assertions executed.

## Production Orders — acceptance #41 (P4.1)

**41:** Authorized factory users create/edit draft production plans linked to an
eligible sales line or an internal reason. Stable request identity and one active
plan per sales line prevent duplicate active planning. Drawing geometry/counts
and area remain reproducible; approved plans freeze their snapshot. Owner-only
approval, valid reasoned holds/cancellations, version checks and atomic old/new
audit are enforced independently by the DB. Planning never changes stock.

Coverage: `tests/unit/production-orders.test.ts`,
`tests/integration/production-orders.test.ts`,
`tests/sql/production-orders.sql`, `tests/e2e/production-orders.spec.ts`, plus
`scripts/validate-schema.mjs` checks. SQL tests run only on disposable migrated
databases; browser tests require local Supabase. Existing #3–6/#10/#21/#39 remain
required regressions (ledger, privacy, prices and drawings).

## Attendance location exports — acceptance #42

**42:** Any role with `attendance:view` can download the selected date and
morning/afternoon shift as two distinct Excel reports: Office contains only
active `work_location = office` employees; Factory contains active factory
employees and the established null/unknown fallback. The export is read-only,
uses existing RLS-respecting queries, shows unmarked employees explicitly, and
does not alter attendance or payroll source records.

Coverage: `tests/unit/attendance-export.test.ts`,
`tests/integration/attendance-report-render.test.ts`, and the download-link case
in `tests/e2e/attendance.spec.ts`.

## Inventory Demand source capture — acceptance #40

**40:** An authorized inquiry manager records an explicit unavailable-product
reason with diameter, panel size, mesh spacing and positive requested quantity.
Reopening/revising preserves the same inquiry and its customer link; invalid
fields or newly assigned archived reasons fail. This creates no stock movements
and does not imply a lost sale without an existing `lost` status category.

`tests/unit/inquiry-loss.test.ts` covers validation and EN/中文 labels/messages;
`tests/integration/inquiry-stockout.test.ts` covers actions, query-builder
duplicate-ignore semantics, old/new audit metadata, failures and denied roles;
`tests/e2e/inquiry-stockout.spec.ts` covers save/reopen/revise; the rolled-back
`tests/sql/inquiry-stockout.sql` checks actual reason uniqueness, RLS and
unchanged ledger counts on a disposable migrated database. Existing acceptance
#3–6/#21 remain required regressions.

## Migration reliability regression (Phase 2 prerequisite)

Acceptance #13/#34 depend on retaining Purchasing retirement while preserving
the surviving ledger schema. `tests/unit/migration-drift.test.ts` covers actual
retirement SQL, optional `IF EXISTS`, whitespace/case variations, exclusion of
columns belonging to retired tables, and continued detection of missing ledger
columns. `tests/integration/migration-drift-cli.test.ts` runs the real checker CLI
with a fixture `psql` catalog: a retired catalog passes, missing Tasks/ledger
objects fail, and only SELECT queries are issued. These tests never connect to a
database. No UI workflow changes in this increment; existing Playwright flows
remain the browser regression suite when local Supabase is available.

## Dashboard correctness and performance regressions

Acceptance #7 aggregation and #10 access restrictions remain covered. Additional
regressions in `tests/integration/dashboard-queries.test.ts` exercise the real
Supabase JS query builder with a controlled HTTP transport: month totals beyond
1,000 records, empty/error responses, HEAD-only attendance reads, Bangkok month
boundaries, missing Special Price configuration, and independent counts starting
while the type lookup is unresolved. `tests/integration/auth-resolution.test.ts`
covers bounded transient retries, no final retry delay, signed-out sessions,
invalid roles, and inactive-user redirects. Existing attendance-domain tests
continue to prove that present/late count and leave is excluded.

## Database-enforced invariants (belt & suspenders)

The domain tests assert the rules; the database enforces them independently:

- `stock_movements_sign_chk` — sign matches movement type.
- `enforce_stock_rules` — no negative balance without Owner override + reason.
- `prevent_update` / `prevent_delete` — ledger & audit log append-only;
  attendance/stock never hard-deleted.
- RLS on `employee_private` + private buckets — salary/photos restricted.
- Purchasing tables/RPCs are removed after audit snapshots; `prevent_retired_purchase_receipt` blocks new receipts while historical ledger rows stay intact.
- `enforce_sale_delivery_rules` — no delivering against a draft/cancelled SO;
  no over-delivery without Owner override + reason.
- `enforce_so_header_immutable` / `enforce_so_item_immutable` — a SO's
  commercial terms and line items lock once confirmed (Draft only).
- RLS on `customers`/`sales_orders`/`sales_order_items` — restricted to
  owner/system_admin/sales_admin, which is also what keeps sale prices out of
  every other role.
- RLS `movements_insert` includes `sales_admin` — otherwise a real Sales Admin
  user would be blocked from delivering goods despite the app-level RBAC
- RLS `login_events_insert` requires `user_id = auth.uid()` — every field
  (IP/country/city/email) is derived server-side in `recordLoginEvent`, never
  caller-supplied, so a client can only ever insert a row attributed to
  itself.
  allowing it (`post_sale_delivery` is `SECURITY INVOKER`).
- `enforce_payment_receipt_rules` — sums every `payment_receipts` row
  (deposit + final together) against the Sales Order's line-item total,
  freshly computed on every insert, never a stored balance; also blocks a
  `final` receipt until the deposit invoice is `paid`, and a `deposit`
  receipt against a `void` invoice.
- RLS on `payment_receipts` — restricted to owner/system_admin/sales_admin
  (write: owner/sales_admin), same shape as `deposit_invoices`.
- `enforce_payroll_run_immutable` — locks period/pay dates once a run leaves
  Draft, AND is the sole enforcement point requiring Owner specifically for
  the `draft → approved` transition (`PAYROLL_APPROVE_OWNER_ONLY`) — the app
  layer checks this too, but the trigger is the ultimate authority, same
  belt-and-suspenders shape as the negative-stock/over-receipt/over-delivery
  guards.
- `enforce_payroll_item_immutable` — payslip items (days_worked/rate/
  base_amount/overtime_amount) lock once the run is `paid` or `cancelled`;
  writable through Draft AND Approved (widened in migration 0028) so
  `pay_payroll_run` can snapshot the live figures at the actual freeze point.
- `enforce_payroll_item_line_immutable` — deduction/advance lines are a
  separate, narrower window: still Draft-only, unchanged (lines can't be
  newly inserted into an approved run, even though the run itself still
  tracks live pay).
- RLS on `payroll_runs`/`payroll_items`/`payroll_item_lines` — restricted to
  owner/system_admin/payroll_admin, which is also what keeps salary figures
  out of every other role.
- `payroll_item_deductions` view sums lines on read — deductions total (and
  therefore net pay) is never a stored, driftable value.

`scripts/validate-schema.mjs` asserts these constructs exist so they cannot be
silently removed.

## Running subsets

P5.1 is a documentation-only audit: see the
[KPI definitions and future test requirements](DASHBOARD_KPI_DEFINITIONS.md).
Later analytics changes must test source grain, currency/unit separation,
Bangkok date boundaries, incomplete coverage, errors versus empty success,
all eight roles and query/export/drill-down parity. Audit definitions alone do
not certify those future behaviors or replace the existing acceptance tests.

```bash
npm run test                    # all unit + integration
npx vitest run tests/unit/stock-ledger.test.ts
PLAYWRIGHT=1 npm run test:e2e   # e2e against a running app
```
