# Test Plan — Zysteel Operations

## How verification works

`npm run verify` is the single gate. It runs, stopping at the first failure:

1. **format** — `prettier --check`
2. **lint** — `next lint`
3. **typecheck** — `tsc --noEmit`
4. **test** — Vitest unit + integration (`tests/unit`, `tests/integration`)
5. **schema** — `scripts/validate-schema.mjs` (static; also applies migrations to
   `SUPABASE_DB_URL` if set and `psql` is available)
6. **build** — `next build`
7. **e2e** — Playwright critical flows, **only when `PLAYWRIGHT=1`** (requires a
   built, running, Supabase-configured app + installed browsers)

CI runs steps 1–6 (no database needed). Playwright is opt-in so a credential-less
CI stays green; run it locally/staging with `PLAYWRIGHT=1 npm run verify` after
`npx playwright install`.

## Test layers

- **Unit** (`tests/unit`): pure domain logic — the business rules. Fast, no I/O.
- **Integration** (`tests/integration`): multi-step domain scenarios (full ledger
  flow, report rendering, Telegram idempotency with the mock client + in-memory
  store).
- **E2E** (`tests/e2e`): unauthenticated smoke flows (routing, login/setup render)
  that pass with or without a backend. Authenticated flows are added per module as
  a Supabase test project is wired up.

## Acceptance criteria → tests

| # | Criterion | Covered by |
| --- | --- | --- |
| 1 | Admin creates a product specification | `tests/unit/products.test.ts` (label + uniqueness signature); action `createSku` |
| 2 | Receive purchased stock into Storage Room | `tests/unit/stock-ledger.test.ts` (purchase_receipt increases only that SKU/location) |
| 3 | Transfer Storage→Warehouse; company total unchanged | `tests/unit/stock-ledger.test.ts` + `tests/integration/stock-flows.test.ts` (invariant) |
| 4 | Production increases only the selected 钢筋网 SKU | `tests/unit/stock-ledger.test.ts`; `tests/integration/stock-flows.test.ts` |
| 5 | Confirmed sale delivery decreases only the correct SKU + location | `tests/unit/stock-ledger.test.ts` |
| 6 | Negative stock blocked without Owner override | `tests/unit/stock-ledger.test.ts` (`evaluateNegativeGuard`); DB trigger `enforce_stock_rules`; schema check |
| 7 | Morning & afternoon reports aggregate correctly | `tests/unit/attendance.test.ts`; `tests/integration/reports-render.test.ts` |
| 8 | Telegram scheduled send does not duplicate a report | `tests/integration/telegram-idempotency.test.ts` |
| 9 | Payroll draft reads attendance & respects the confirmed pay rules | `tests/unit/payroll.test.ts`; `tests/integration/payroll-flows.test.ts`; DB function `create_draft_payroll_run` |
| 10 | Unauthorized users cannot access salary / private photos | `tests/unit/rbac.test.ts` (sensitive-data matrix); RLS on `employee_private` + private Storage buckets; schema check |
| 11 | Create a purchase order with line items (supplier, dates, currency, notes, at least one SKU/location/qty/unit cost line), edit the header while Draft, issue it, and cancel it; editing is no longer offered once issued | `tests/e2e/purchasing.spec.ts` |
| 12 | A cancelled purchase order cannot be issued or re-cancelled | `tests/unit/purchasing.test.ts` (`canCancel`); DB trigger `enforce_po_header_immutable`; schema check |
| 13 | Purchase order costs visible only to Owner/System Admin/Warehouse Admin | `tests/unit/rbac.test.ts`; RLS on `suppliers`/`purchase_orders`/`purchase_order_items`; schema check |
| 34 | PO line items are freely addable/removable while Draft, immutable once Issued; a Draft PO cannot be issued with zero line items | `tests/e2e/purchasing.spec.ts`; `tests/unit/purchasing-view.test.ts`; DB triggers `enforce_po_item_immutable` (`trg_po_items_no_insert`/`no_update`/`no_delete`), `enforce_po_header_immutable` (`PO_ISSUE_NO_ITEMS`); schema check |
| 35 | Purchase Orders list filters (PO number, supplier, status, order-date range, item by product family) and the Download PDF/Excel exports honor the same filters as what's shown on screen | `tests/e2e/purchasing.spec.ts` |
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
| 24 | Every employee is paid daily — `pay_type` is constrained to `'daily'` (monthly-salary pay removed) | `employees_pay_type_check`/`payroll_items_pay_type_check`; DB function `create_draft_payroll_run`; schema check |
| 25 | Net pay = base amount − sum of deduction/advance lines, never a stored total | `tests/unit/payroll.test.ts` (`computeNetAmount`); view `payroll_item_deductions` |
| 26 | A payroll run can only be approved by an Owner | `tests/unit/rbac.test.ts`; DB trigger `enforce_payroll_run_immutable` (`PAYROLL_APPROVE_OWNER_ONLY`); schema check |
| 27 | Deduction/advance lines and run dates are only editable while Draft; a Paid (or Cancelled) payroll run's items are permanently immutable | `tests/unit/payroll.test.ts` (`canEditRun`, `isPayrollLive`); `tests/unit/payroll-view.test.ts`; DB triggers `enforce_payroll_item_immutable`/`enforce_payroll_item_line_immutable`; schema check |
| 28 | Payroll figures visible only to Owner/System Admin/Payroll Admin | `tests/unit/rbac.test.ts`; RLS on `payroll_runs`/`payroll_items`/`payroll_item_lines`; schema check |
| 29 | Salary/pay figures are never written to the audit log | `src/lib/actions/payroll.ts` (manual review — every `writeAudit` call omits amounts, matching `actions/employees.ts`'s `saveEmployeePrivate` precedent) |
| 30 | A sales order item's `unit_price` is server-derived from Price/m² × Area/sheet when both are supplied (client value never trusted) | `tests/unit/deposit-invoice.test.ts` (`computeUnitPriceFromArea`); DB function `create_draft_sales_order`; `tests/e2e/deposit-invoice.spec.ts` |
| 31 | A deposit invoice may only be generated for a confirmed SO, and only one active invoice per SO | `tests/unit/deposit-invoice.test.ts` (`canGenerateDepositInvoice`); partial unique index on `deposit_invoices`; schema check |
| 32 | Deposit amount / remaining balance = total × percentage (and its complement) — generated columns, never hand-entered | `tests/unit/deposit-invoice.test.ts` (`computeDepositAmount`/`computeRemainingBalance`); generated columns on `deposit_invoices`; schema check |
| 33 | A deposit invoice's status derives from its payments ledger, never set directly, and mirrors onto the sales order's `payment_status` | `tests/unit/deposit-invoice.test.ts` (`computeDepositInvoiceStatus`); DB triggers `recompute_deposit_invoice_status`/`mirror_deposit_invoice_status`; `tests/e2e/deposit-invoice.spec.ts` |

Additional coverage: `tests/unit/datetime.test.ts` (Asia/Bangkok ⇄ UTC,
dd/mm/yyyy, business-date boundary), `tests/unit/inventory-view.test.ts`
(Storage/Warehouse/total split + low-stock).

## Database-enforced invariants (belt & suspenders)

The domain tests assert the rules; the database enforces them independently:

- `stock_movements_sign_chk` — sign matches movement type.
- `enforce_stock_rules` — no negative balance without Owner override + reason.
- `prevent_update` / `prevent_delete` — ledger & audit log append-only;
  attendance/stock never hard-deleted.
- RLS on `employee_private` + private buckets — salary/photos restricted.
- `enforce_po_header_immutable` — a PO's commercial terms lock once issued
  (Draft only), and a Draft PO cannot move to Ordered with zero line items
  (`PO_ISSUE_NO_ITEMS`).
- `enforce_po_item_immutable` — PO line items lock (INSERT + UPDATE + DELETE)
  once the parent PO is no longer Draft. (`enforce_purchase_receipt_rules`
  still exists but is dormant — receiving stays out of scope.)
- RLS on `suppliers`/`purchase_orders`/`purchase_order_items` — restricted to
  owner/system_admin/warehouse_admin, which is also what keeps purchase costs
  out of every other role.
- `enforce_sale_delivery_rules` — no delivering against a draft/cancelled SO;
  no over-delivery without Owner override + reason.
- `enforce_so_header_immutable` / `enforce_so_item_immutable` — a SO's
  commercial terms and line items lock once confirmed (Draft only).
- RLS on `customers`/`sales_orders`/`sales_order_items` — restricted to
  owner/system_admin/sales_admin, which is also what keeps sale prices out of
  every other role.
- RLS `movements_insert` includes `sales_admin` — otherwise a real Sales Admin
  user would be blocked from delivering goods despite the app-level RBAC
  allowing it (`post_sale_delivery` is `SECURITY INVOKER`).
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

```bash
npm run test                    # all unit + integration
npx vitest run tests/unit/stock-ledger.test.ts
PLAYWRIGHT=1 npm run test:e2e   # e2e against a running app
```
