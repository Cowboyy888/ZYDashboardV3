# Next development phase — technical assessment

**P9 update:** [Technical audit and first fix](PHASE9_TECHNICAL_AUDIT.md) implements
the dashboard's existing-permission read/section gating. Other security/reliability
findings below remain open unless their earlier implementation update says so.

**P5.1 correction:** [Dashboard KPI audit](DASHBOARD_KPI_DEFINITIONS.md) supersedes
any active payment-receipt-entry assumptions below: migration 0037 changed current
UI payment entry to paid-date markers without amount transactions. Historical
receipt guards remain, but those rows do not establish complete current cash or
receivables coverage. The new audit also distinguishes production planning from
execution and documents current dashboard permission and aggregate gaps.

**Phase 3 update:** [Inventory Demand increment 1](INVENTORY_DEMAND.md) implements
explicit unavailable-product/loss-reason source capture on existing inquiries,
including editable specification fields. The original gap descriptions below
are historical; snapshots, aggregation and recommendations remain unimplemented.

Audit date: 30/10/2026. Repository baseline: `32812d9`. Scope: Phase 1 of the
next-development brief; assessment and recommendations only. No application
behavior, permissions, database schema, business records, or deployments changed.

## Phase 2 — increment 1 implementation update

The Phase 2 recheck confirms inquiry salesperson/date/history/customer fields,
editable stages, quotations linked to orders, Team Tasks completion/overdue
tracking, sales targets, and KPI scorecards already exist. Missing CRM work
remains source-linked task creation with duplicate protection, explicit
follow-up completion semantics, lost-reason entry, expected-close-date editing,
filtered conversion metrics, and weekly PDF/Excel reporting. Map new pipeline
labels to existing stage IDs/categories; do not replace production statuses.
Expected order value must retain currency and source meaning; multi-record
customer conversion metrics require a stated counting unit and reliable links.

This first increment implements roadmap item 1 below: the migration checker now
recognizes Purchasing's plain `DROP TABLE` statements and ignores columns of
retired tables. It still checks surviving ledger fields and unrelated tables.
Parser tests first reproduced five failures; the corrected unit/CLI regression
suite passes all 29 tests. CLI integration uses a fixture `psql` catalog and
asserts SELECT-only access; it is not a live database verification.

Final increment gate: `npm run verify` passed format, lint, typecheck, tests,
schema checks, and build in 32.2 seconds. Playwright auto-skipped because local
Supabase was unreachable; no live database or browser verification is claimed.

No CRM UI, translations, status workflow, schema, RBAC/RLS, or production records
change in this prerequisite. Telegram concurrency/durable retry, authorization
parity, audit atomicity, and the ledger guard findings below remain unresolved;
do not treat this parser repair as clearing those blockers. Address the next
focused security/reliability task before adding the missing CRM workflows.

The original audit and its recommendations/results below are retained as the
baseline assessment; its statement that implementation was not included refers
to Phase 1.

## Acceptance criteria and evidence limits

This audit is complete when it inventories the requested capabilities against
source, distinguishes shipped features from schema/domain scaffolding, records
security and correctness risks, and supplies an ordered roadmap plus one bounded
next task. Verification includes the repository gate and non-mutating probes.
Existing acceptance criteria in `docs/test-plan.md` remain the reference:
inventory #3–6/#18–22, Telegram #8/#14, sensitive access #10/#21/#28–29,
Purchasing retirement #11–13/#34, payments #30–37, and drawings #39.

Reviewed `AGENTS.md`, `CLAUDE.md`, product/architecture/data dictionary, decisions,
operations/Telegram runbooks, test plan, existing roadmap/security matrix, recent
commits, App Router pages/API routes, actions, domain/query/report adapters, tests,
and migration definitions. The installed stack is Next.js 16.3.2, React 19.2.8,
TypeScript, and Supabase; `CLAUDE.md` still describes Next.js 15.

Source review is not certification of the deployed database. A read-only local
catalog probe could not connect/run with the available local database tooling;
the configured local Supabase API was unreachable. No production access, reset,
migration replay, advisor run, or query-plan measurement was performed. Historical
live claims in `SECURITY_PERMISSION_MATRIX.md` were not reverified against a live
database here. Browser responsiveness and bilingual completeness remain untested
in this run.

## What already exists and what is missing

| Area                         | Implemented and reusable                                                                                                                                                                                     | Remaining gap                                                                                                                                                                                                                                                                                   |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Customers                    | Master records, permanent customer codes, customer types, archive/history guards; `actions/sales.ts`, Customers manager                                                                                      | Conversion matches unlinked quotations against active customer names in application code; this is not a concurrency-safe deduplication guarantee. No unified customer timeline or customer-level reminder queue.                                                                                |
| Inquiries and follow-ups     | Specification fields (diameter, sheet size, spacing, quantity), salesperson, next date/action, follow-up history and responsible employee; `actions/sales-inquiries.ts`, inquiry editor, `inquiry_followups` | No automated reminder delivery. Follow-up insert and inquiry snapshot update are separate writes, and snapshot errors are ignored.                                                                                                                                                              |
| Qualification and losses     | Editable open/won/lost stages, seeded Qualified stage and stage probability; `0038_crm_pipeline.sql`, `domain/pipeline.ts`                                                                                   | `loss_reason_id` and `inquiry_loss_reasons` exist, but current inquiry validation/action/form do not expose a loss reason. No explicit interest-level workflow. Pipeline domain summaries are not evidence of a complete pipeline UI.                                                           |
| Quotations and conversion    | Documents, validity calculation, salesperson, filters, PDF/Excel, deposit/balance markers, linked draft order; `actions/quotations.ts`, `domain/quotation.ts`, `0027_quotation_to_sales_order.sql`           | No overdue-quotation notification queue or formal sent/accepted/lost lifecycle. Conversion is best effort after payment marking; a failed conversion has no explicit repair/retry action. Linked orders do not by themselves establish a reliable quotation conversion-rate denominator.        |
| Sales orders and collections | Draft/confirm/deliver/cancel, per-location ledger delivery, committed-versus-physical stock, deposit invoices and receipt ledger                                                                             | No consolidated monthly revenue/outstanding customer dashboard. Quotation payment-date markers and SO receipt amounts are separate representations; avoid counting both as collections. Keep USD/KHR/CNY separate.                                                                              |
| Team performance             | Tasks, customer links, daily metrics, Today/Weekly screens, employee summaries, daily task PDF, monthly sales targets and KPI scorecards                                                                     | No source shortcut from an inquiry, follow-up-specific queue, monthly team report/targets integration, or weekly performance Telegram report. Employees and login profiles are distinct identities; do not assume a salesperson can log in as that employee.                                    |
| Inventory                    | Signed ledger, balances by SKU/location, minimum levels, low-stock display/report, transfers, committed-stock calculation, PDF/Excel                                                                         | No normalized demand analysis across sources, explicit unavailable-specification losses, turnover windows, or stocking recommendations. Do not present a low-stock minimum as a demand forecast.                                                                                                |
| Production                   | `production_output`, dashboard quick entry, SKU/specifications, linked wire-mesh drawings; machinery maintenance module                                                                                      | No production-order/planning schema, line assignment, plan/actual progress, material estimate, waste/defect records, or completion report. Maintenance records are not production capacity or a bill of materials.                                                                              |
| Management dashboard         | Attendance/MTD rate, production output, inventory/low stock, gated order/inquiry/payroll/price counts                                                                                                        | No team task summary, monthly sales value, pending quote/conversion metrics, customer balances, demand or production plan metrics. Production total currently sums all `production_output` quantities while its label says 张 · 钢筋网; mixed units/families would make that number misleading. |
| Telegram                     | Secret-guarded cron dispatch, configurable Bangkok times, Office/Factory attendance and inventory destinations, manual resend, mock adapter                                                                  | Only attendance/inventory report types exist. Requested sales/follow-up/production/weekly team messages are missing; inventory low-stock highlighting should be reused. Concurrent idempotency is defective (below).                                                                            |

Purchasing stays removed. Commit `84f7de0` removed its routes/actions/exports and
introduced the retirement migration with restricted audit snapshots. Historical
receipt movements remain; new receipts are blocked. Do not restore a Purchasing
module to solve raw-material planning.

Recent work to preserve: `32812d9` fixes HEAD attendance counts beyond 1,000 rows,
Bangkok price-record cutoffs, independent query execution, and request-scoped auth
deduplication; `59e89db`/`a37020b` add drawings and compatible sales-source prefill;
`f9f2c0d`/`cd86af0` address quotation filters. Reuse these implementations.

## Correctness, security, and performance findings

### High: Telegram uniqueness is checked after the external side effect

`telegram/report-sender.ts` performs `has → sendMessage → record`.
`SupabaseSentReportStore.record` inserts a unique report key only after sending
and does not inspect the returned database error. Two workers can both observe
absence and both send before the uniqueness constraint applies. A mock-only
`Promise.all` probe against the actual sender produced **2 sends, 2 sent
outcomes** for one key. No real Telegram messages were sent.

The durable store also cannot insert a success row for a key already recorded as
failed: the unique key remains occupied. Because insert errors are ignored, a
successful retry may not become durably sent and later ticks can resend it.
Existing #8 tests prove sequential deduplication and in-memory retries, not these
durable/concurrent cases. Fix before adding more scheduled report types. An
atomic claim prevents concurrent attempts; it cannot alone guarantee exactly-once
delivery across an external send followed by a crash. Specify how uncertain
outcomes are reconciled before introducing automatic stale-claim retries.

### High: audit writes and multi-step commercial writes can silently diverge

`lib/audit.ts` catches thrown errors but ignores Supabase's returned `error`;
mutation success can be returned without a persisted audit row. Many mutation
events also omit old/new details (for example inquiry update/follow-up). Salary
values must remain excluded when improving this.

Quotation create inserts header and lines separately. Update writes the header,
deletes old lines without checking that delete's error, then inserts replacement
lines. A later failure can leave incomplete commercial data. `addFollowup` has a
similar insert/snapshot split. Move each workflow into an RLS-respecting atomic
operation with its audit event, preserving current behavior rather than simply
throwing after an already-committed write. Conversion from a paid quotation has
an explicitly documented best-effort contract; repair it without silently
rolling back the user's payment marker.

### High: reconcile the ledger deletion exception with the current contract

`0045_allow_guarded_movement_delete.sql` and the current retirement migration's
`delete_archived_sku_if_empty` permit deletion of stock movements for an archived,
zero-total SKU with no sales or historical purchasing-line references. The older
migration records historical user approval, but the current `AGENTS.md` forbids
hard-deleting stock records. A net-zero balance can still contain meaningful
movement history. Flag this conflict for a focused forward repair; do not change
historical migrations, invoke this deletion path, or treat old approval as
authorization to weaken today's invariant.

### High investigation priority: concurrent balance and payment guards

The latest source definitions of `enforce_stock_rules` (0002),
`enforce_sale_delivery_rules` (0014), and `enforce_payment_receipt_rules` (0030)
read aggregate totals without explicit per-resource serialization. Simultaneous
transactions may both pass a check against the same prior total. This is a
source-based concurrency risk, not a reproduced database incident in this run.
Add two-session disposable-Postgres probes for #6/#19/#37 before selecting a
locking strategy; cover transfers, cancellation, and deadlock order too.

### Medium: permission parity findings still apply in source

The existing security matrix already documents broad Task picker payloads,
System Admin quotation writes exceeding app grants, and movement insert policies
that grant Sales Admin more movement types than delivery. Current source still
contains these patterns. Narrow picker projections reduce browser payloads but
do not restrict direct API column access; any real authorization change must
cover RBAC and effective RLS together. Salary/private storage must remain scoped
to Owner/System Admin/Payroll Admin.

The dashboard unconditionally queries/renders attendance, employee exceptions,
inventory, and production. Gate both queries and sections by existing module
permissions. **Viewer already has attendance/inventory view permissions** in
`rbac.ts`; the old roadmap's proposal to hide these from Viewer is incorrect.
Use the existing Reports page's conditional query/render pattern as a reference.

### Medium: migration verification overstates final-schema assurance

`check-migration-drift.mjs` recognizes `DROP TABLE IF EXISTS` only, whereas the
Purchasing retirement uses `DROP TABLE public.<name>`. A pure probe found zero
recognized retired tables, so a correctly retired database can be reported as
missing Purchasing objects. This blocks reliable release validation.

`validate-schema.mjs` concatenates migration history and checks regular-expression
presence. An obsolete policy/function can satisfy a check even if a later
migration replaces it; RLS assertions can span unrelated statements. Static
checks are useful smoke tests, not effective-policy verification. Its optional
database check is now read-only (the historical replay bug was fixed); retain
that protection and `tests/unit/validate-schema.test.ts`.

### Medium: complete-data reporting and measured query optimization

`getInquiries`, `getInquiryFollowups`, `getSalesOrders`, all-order item reads,
`getBalances`, and production quantity reads do not explicitly page through the
full dataset. Aggregations/exports using these helpers risk truncation at the
API row limit. The fixed attendance HEAD counts do not fix those other callers.
Most query helpers also collapse errors into empty data, so dashboards/reports
can confuse unavailable data with zero activity. Bound periods, explicitly select
needed columns, aggregate on the database where appropriate, and distinguish
errors from empty datasets before building demand KPIs.

Existing indexes include inquiry follow-up/source indexes, sales delivery lookup,
task/date and ledger indexes; RLS InitPlan optimization is already present in 0053. Do not add indexes or cross-request caches based solely on query count.
Measure authorized-role `EXPLAIN (ANALYZE, BUFFERS)` on disposable representative
data and request latency/payloads first. No live latency claim is made here.

## Prioritized implementation roadmap

Each row is a separate reviewable change; order is dependency-based, not approval
to execute every row. Preserve Purchasing retirement and all existing invariants.

| Order | Task and business value                                                          | Reuse / boundary                                                                      | Required evidence                                                                                                                                                                                     |
| ----- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | Repair drift checker retirement handling; make release checks trustworthy        | Existing parser + `tests/unit/migration-drift.test.ts`; no schema/workflow change     | Recognize actual retired tables, retain checks on surviving objects; no database writes                                                                                                               |
| 2     | Harden concurrent Telegram claims and durable retries before expanding reminders | Sender/store interfaces, `sent_reports`, #8; additive migration only after review     | Concurrent callers send once; persisted failure→success survives a new process; database errors fail visibly; manual resend/destination isolation preserved; documented uncertain-send recovery       |
| 3     | Close ledger deletion/serialization and RBAC gaps                                | Existing ledger guards/security matrix; small independent changes                     | Real DB tests for #3/#6/#19/#37 and every affected role; reject deletion of history; no widened grants                                                                                                |
| 4     | Make inquiry follow-up and quotation edits atomic and audited                    | Existing action schemas/RPC patterns + audit log                                      | Injected intermediate failures leave original data intact; one committed audit event; old/new metadata; no salary values                                                                              |
| 5     | Capture inquiry lost reasons: highest-value missing CRM feature                  | Existing `inquiry_loss_reasons`, `sales_inquiries.loss_reason_id`, statuses and form  | EN/中文 selection persists through create/edit; archived reasons remain readable; authorized writes only; no fabricated historical reasons                                                            |
| 6     | Surface follow-ups and tasks on role-based dashboards                            | `followUpFlag`, task performance helpers, dates, existing Reports page gating         | Due/overdue/closed/undated cases; correct permissions including Viewer; no unauthorized module requests; independent queries stay parallel                                                            |
| 7     | Deliver demand-analysis MVP and PDF/Excel                                        | Existing inquiry fields, SKU catalog, committed-stock domain, branded report builders | Provenance and explicit time window; separate inquiry demand from committed orders and deliveries; avoid double-counting quote→order; full pagination and unit/spec matching; unknown values explicit |
| 8     | Add production planning, then execution/progress/completion                      | SKU catalog, drawings, sales-order items, ledger, maintenance as reference            | Reviewed production lifecycle/RBAC; planned-versus-good/defect/waste tests; estimates use approved BOM/yield inputs; no automatic stock or raw-material mutation                                      |
| 9     | Expand management KPIs and Telegram incrementally                                | Existing orders/receipts, targets/KPI, tasks, report routing                          | Currency-separated revenue/balances; explicit conversion denominator; quantity grouped by unit/family; business-date windows; report permissions/destination privacy; #8 regression suite             |

For demand analysis, match only reliable structured specifications and units.
Free-text quotation descriptions are not catalog SKUs. Track unavailable-stock
losses prospectively with an explicit reason and source link; existing generic
Specification loss is not proof of stock unavailability. Preserve unknowns in
historical imports and report coverage. Rank observed demand/turnover first;
finished-goods versus raw-material recommendations additionally require agreed
lead times, capacity, material mappings, yield and safety-stock rules. Do not
invent these inputs or imply that requests are confirmed sales.

Dormant schema is not shipped functionality: commission, construction projects,
competitor pricing, and older daily sales/marketing-report tables have domain/SQL
scaffolding but no corresponding active action/page workflows. Document and
evaluate reuse before adding equivalents; do not delete them. The older roadmap
already has partial/completed work for docs, drift tooling and security review;
its unchecked boxes should not trigger reimplementation.

## Recommended next task: fix the migration drift false positive

This is the smallest safe first implementation, independent of production data or
permission decisions. The highest-priority missing reliability capability is
concurrent/durable Telegram idempotency (roadmap item 2); the first missing CRM
feature is loss-reason capture (item 5). Repair release verification first so
subsequent database work can be assessed reliably.

Implementation plan:

1. Extend the existing DROP TABLE parser to recognize the actual retirement SQL
   with and without `IF EXISTS`; use migration fixtures, not a new migration
   tracking system. Exclude column expectations belonging to retired tables too.
2. Extend existing migration-drift unit coverage using the Purchasing retirement
   and final-state fixtures. Ensure surviving stock columns and unrelated missing
   tables still fail appropriately; do not suppress all historical checks.
3. Update the parser limitation notes/runbook and run `npm run verify`. Once a
   disposable local database is available, compare a fully retired catalog and a
   deliberately missing surviving object using read-only queries. Never apply
   migrations as part of checking drift.

No implementation is included in this Phase 1 audit, consistent with the request
to start by analyzing and recommending the next task.

## Verification results

- Baseline `npm run verify`: passed format, ESLint, TypeScript, unit/integration
  suite, static schema checks, and production build (33.8 seconds).
- Playwright: automatically skipped because local Supabase was unreachable;
  setting `PLAYWRIGHT=1` alone is not used by the verification script. Use
  `REQUIRE_E2E=1` with a ready disposable local backend to enforce execution.
- Live RLS tests in `tests/integration/rls-policies.test.ts` return early when
  their loopback database/psql prerequisite is unavailable. A green Vitest result
  here does not prove that those database probes ran.
- Non-mutating reproduction: actual Telegram sender with mock transport and
  in-memory store, two concurrent calls → two sends. Existing sequential tests
  do not cover this interleaving.
- Non-mutating reproduction: actual retirement SQL passed to existing DROP parser
  → zero recognized retired tables. No target database was required.

Supabase references checked for the review: [RLS and view security](https://supabase.com/docs/guides/database/postgres/row-level-security)
and [range pagination](https://supabase.com/docs/reference/javascript/range).
The changelog markdown endpoint could not be read by the web tool; no new
Supabase API was implemented based on it.
