# Inventory Demand Intelligence — incremental implementation

## Audit and scope

The inventory ledger, SKU catalog, inquiry specification/quantity fields,
quotation lines, order/delivery links, committed-stock calculations and branded
inventory PDF/Excel builders already exist. Reuse them. Purchasing stays removed;
production remains an explicit `production_output` workflow with no automatic
raw-material consumption.

`sales_inquiries.loss_reason_id` and `inquiry_loss_reasons` were added in migration
0038, but were absent from inquiry forms/actions/types. Inquiry specification
inputs were also hidden on edit. The first useful increment is to capture an
explicit unavailable-product reason on the existing opportunity, with requested
specification and quantity, before attempting aggregate demand analysis.

## Increment 1 — explicit unavailable-product inquiry

Sales → Inquiries → New/Edit now exposes diameter (mm), panel size (m), mesh
spacing, and the existing loss-reason lookup. “Product unavailable / 产品缺货”
requires nonblank specification attributes and a positive requested quantity.
These are reported request attributes, not automatically matched catalog SKUs.
No unit conversion or parsing of historical free text is implied.

The first explicit save creates the `stock_unavailable` lookup code through the
authenticated, RLS-respecting client. Existing `code` uniqueness plus
`ON CONFLICT DO NOTHING` semantics prevent duplicate reasons and never overwrite
an archived reason. No lookup is created merely by viewing the page. Generic
Specification/Lead-time loss reasons are not reclassified as stockouts.

Edits update the same inquiry UUID and preserve its customer link. An omitted
loss-reason field retains the existing reason; an explicitly empty field clears
it. Archived reasons stay readable and may be retained on their existing inquiry,
but cannot be newly assigned. Reason changes and requested-specification edits
include old/new metadata in the existing audit events; lookup creation has its
own audit event. Existing audit-write atomicity limitations described in
`NEXT_PHASE_AUDIT.md` remain; this increment does not claim to repair them.

A product-unavailable reason can accompany an open inquiry that is still being
followed up. It is **not** a lost sale until the inquiry's existing status has
category `lost`. Marking a reason never changes a stage, creates an order/task,
or posts a stock movement. Updating one inquiry does not create a separate demand
record for every revision. Cross-inquiry/quotation opportunity deduplication is
not implemented and no cross-source totals are exposed yet.

Existing request date, salesperson, customer ID (when linked), follow-up history,
area/sheet and price fields remain the source. The form does not create customer
master records. Historical name-only inquiries remain name-only; a reliable
customer identity must be established before unique-customer demand counts.

## Acceptance and verification

- An authorized inquiry manager can create/edit/read an unavailable-product reason
  with requested specification and quantity, in EN/中文.
- Invalid/missing request fields fail without creating an inquiry or lookup.
- Updating an existing inquiry preserves its UUID and customer reference.
- Archived/invalid lookups and denied database operations are handled explicitly.
- Unauthorized app roles are rejected before data access; existing reason-table
  RLS remains owner/system_admin/sales_admin only.
- No new tables, migrations, permissions, stock mutations, classification,
  historical backfills, or scheduled sends.

Coverage: `tests/unit/inquiry-loss.test.ts` (validation/schema/localization),
`tests/integration/inquiry-stockout.test.ts` (real Supabase query builder with
controlled transport), `tests/e2e/inquiry-stockout.spec.ts` (create/reopen/revise),
and `tests/sql/inquiry-stockout.sql` (rolled-back probes on a disposable migrated
database only). Acceptance #40 in `test-plan.md` tracks this source-data workflow;
inventory #3–6 and commercial-access #21 remain unchanged.

Database verification for this increment replayed all 62 migrations in an
isolated PostgreSQL 17 cluster with minimal Supabase auth/storage stubs, then ran
the SQL probe successfully. The cluster was removed afterward. This verifies the
SQL/RLS path against the repository migrations, not deployed Supabase state or
browser behavior. The local Docker/Supabase service was not running.

Final results: `npm run verify` passed format, lint, typecheck, unit/integration,
schema checks and production build (34.6 seconds). The focused source-capture
suite passed 15 tests. The new Playwright scenario is listed successfully;
browser execution auto-skipped because local Supabase was unreachable. EN/中文
copy received a final formatting check after verification.

## Changed files in this increment

- UI: `src/app/(app)/sales/inquiries/page.tsx` and `inquiries-client.tsx`.
- Actions/domain/validation: `src/lib/actions/sales-inquiries.ts`,
  `src/lib/domain/inquiry-loss.ts`, `src/lib/validation/schemas.ts`.
- Data and localization: `src/lib/db/queries.ts`, `src/lib/db/types.ts`,
  `src/lib/i18n/index.ts`.
- Coverage: the unit, integration, E2E and SQL files named above.
- Documentation: this scope document, architecture, data dictionary, decisions,
  operations runbook, test plan, development roadmap and the prior audit index.

The migration-checker changes already in the working tree belong to the earlier
Phase 2 prerequisite and are preserved.

## Remaining increments and dependencies

1. Finish the stockout observation model: validated customer and inquiry/quotation
   linkage, a stable opportunity/line identity, requested m², financial estimate
   with currency, stock-at-request snapshot provenance/time, and derived shortage.
   Never substitute today's stock for historical availability. Define revision,
   cancellation and source-link rules before adding an additive migration.
2. Aggregate with explicit periods/units and complete server-side pagination or
   database aggregation. Separate unconfirmed requests, confirmed orders and
   delivered sales; count an order converted from a quote once. Names and free-text
   specification descriptions are not reliable deduplication keys.
3. Introduce configurable A/B/C rules with evidence/coverage/confidence. Lead times,
   manufacturing capacity, safety stock and raw-material mappings must be supplied
   or explicitly unknown; diameter alone cannot determine a classification.
4. Compute stock recommendations from approved rules, then build the role-scoped
   responsive dashboard and PDF/Excel report using existing components/utilities.
   Separate currencies and label estimates separately from confirmed revenue.
5. Prepare future alerts only after the documented Telegram concurrency/durable
   retry gap is fixed. No alerts or production orders are created automatically.
