# P9.1 — Technical audit and first verified fix

Audit date: 30/10/2026. Scope agreed with the user: P9.1 plus one small verified
fix. The baseline includes the existing uncommitted Phase 2/3/P4.1/P5.1 work;
those changes are preserved. This is not a production security certification or
authorization to implement every remaining P9 stage.

## Acceptance and evidence boundaries

- Inventory the application, data, permission, integration and release paths;
  classify findings by severity, business impact and evidence strength.
- Reproduce the selected dashboard authorization defect before fixing it. Gate
  both queries and rendered sections with existing permissions; preserve Viewer
  attendance/inventory access, production-entry restrictions, EN/中文 and current
  calculations. Do not change RBAC grants, RLS, schema or business workflows.
- Verify all eight roles and compare request counts using actual query builders;
  distinguish this measurement from database latency or end-user load time.
- Run the repository gate and report unavailable live tests explicitly. Existing
  acceptance #3–10, #21–22 and #28–29 remain relevant; new #42 covers this fix.

Source inventory: 45 App Router pages, 17 API handlers, 22 action-directory
TypeScript files (including shared types), and 63 migrations. Reviewed repository
contracts/product/architecture/data dictionary/runbooks/decisions/test plan, the
prior security matrix and P5.1 metric audit. Rechecked dashboard, auth/proxy,
actions/queries, effective policy definitions in migration order, stock/payroll
guards, storage, Telegram sender/store, report assembly/PDF/Excel, CI, migration
validation/drift tooling and test configuration. Source-pattern inventory finds
an auth guard in every `(app)` page and domain authorization in all 16 export/PDF
handlers; the remaining handler is secret-guarded cron. These markers are not
proof of correct authorization for every branch or deployed policy.

No production database, business records, credentials, deploy, migration apply or
real Telegram send was used. Local Supabase health failed at 127.0.0.1:54321;
Docker could not connect because the configured Colima socket did not exist.
Consequently live Supabase RLS, Auth/Storage and database-backed browser tests
cannot be certified in this run. Earlier disposable PostgreSQL checks in the
Phase 3/P4 docs are historical evidence, not fresh P9 execution.

## Findings and severity

Severity reflects potential business harm; evidence distinguishes an observed
local result from a source-confirmed defect or an investigation hypothesis.
Only P9-02 is fixed in this increment.

| ID    | Severity / state                                           | Evidence and business impact                                                                                                                                                                                                                                                                                                                                                                              | Required next verification                                                                                                                                                                                                                                                                  |
| ----- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P9-01 | Critical dependency advisory / open                        | `npm audit --omit=dev --json` exits 1 with 9 dependency findings: 1 critical, 6 high, 2 moderate. Installed Next 16.3.2 is in affected advisory ranges. Installed packages and registry report verified; app/deployment exploitability is not proven.                                                                                                                                                     | Triage reachable paths and upgrade a reviewed dependency set with lockfile, official migration guidance and full regression/browser checks. See dependency detail below.                                                                                                                    |
| P9-02 | Medium authorization/correctness / fixed locally           | Main dashboard previously queried/rendered attendance, employee exceptions, stock and production receipts for all roles. Real page regression tests failed on forbidden helper calls for five roles; controlled PostgREST transport reproduced excess requests. Denied attendance could become fabricated Unmarked exceptions and denied balances false low-stock warnings.                               | New all-role render/read tests and transport request budgets pass after the fix. Real browser role tests added; local backend unavailable.                                                                                                                                                  |
| P9-03 | High security / source-confirmed gap                       | `0002_functions_triggers.sql` defines `auth_role()` as profile role lookup without `is_active`; no later redefinition was found. `requireUser`/`assertPermission` reject inactive profiles, but many legacy RLS policies use only `auth_role()`. A still-valid token can therefore retain direct-API role authorization after profile deactivation. P4's explicit active guards cover its own paths only. | Disposable authenticated SQL and real Auth tests for all roles, active→inactive/role changes and expired tokens, including private tables/storage/RPCs. Repair forward without blocking required self-profile/auth bootstrap reads. Do not claim token revocation alone fixes all policies. |
| P9-04 | High ledger integrity / source-confirmed mismatch          | Current `movements_insert` permits Sales Admin for every movement type, while app grants authorize delivery rather than arbitrary adjustments. Restoration migration 20261027094741 retains that blanket role condition. Sign/negative checks do not enforce movement-type authorization.                                                                                                                 | All-role direct API INSERT probes for each movement type; align RLS/RPC authority with RBAC in a forward migration. Preserve sanctioned deliveries and ledger history.                                                                                                                      |
| P9-05 | High audit/data integrity / source-confirmed               | `lib/audit.ts` ignores returned insert errors and catches exceptions without failing the mutation. Quotation create/update and follow-up insert/snapshot writes span separate commits; quotation replacement ignores the DELETE response. Partial failure can leave commercial data incomplete or unaudited.                                                                                              | Inject returned DB errors and audit failures; use atomic RLS-respecting operations per workflow, not a late error after an already committed mutation. Salary values stay excluded.                                                                                                         |
| P9-06 | High reliability / previously reproduced, source unchanged | Telegram `report-sender.ts` still does has→send→record. Unique key is persisted after the external effect; durable store ignores insert errors. Prior audit reproduced concurrent duplicate sends using a mock client. A failed row can occupy the unique key and prevent recording later success.                                                                                                        | Durable concurrent/retry/failure/crash probes; define uncertain external-send outcomes before stale-claim retry. A claim alone cannot guarantee exactly once across Telegram and Postgres.                                                                                                  |
| P9-07 | High invariant conflict / source-confirmed                 | Guarded archived-SKU deletion can remove net-zero stock movements (0045 and latest retirement helper), contrary to current append-only/no-hard-delete contract. Zero net balance is not zero history.                                                                                                                                                                                                     | Focused forward repair and tests retaining all ledger rows, balances and historical SKU references. Do not invoke or edit historical migrations.                                                                                                                                            |
| P9-08 | High investigation priority / not reproduced here          | Stock negative, delivery and historical receipt limits read aggregate balances without explicit resource serialization in their latest legacy definitions. Concurrent writes may both validate against the same prior total.                                                                                                                                                                              | Two-session disposable Postgres tests for same SKU/location/order/invoice plus transfer lock ordering, cancellation and deadlocks before selecting locks. No claim of an observed production race.                                                                                          |
| P9-09 | Medium confidentiality/parity / source-confirmed           | Tasks passes full Employee/Customer rows into a Client Component. Marketing/Sales picker access was added in 0059; phone/tax/payment/address columns travel beyond what the picker renders. System Admin quotation RLS writes exceed app sales:manage.                                                                                                                                                    | Narrow DTOs for payloads plus an explicit direct-API access decision; DTO projection alone does not fix column access through RLS. Reconcile quotation policy against canonical RBAC. See security matrix F1/F2.                                                                            |
| P9-10 | Medium financial correctness / source-confirmed            | Sales Excel route computes one `grandTotal` over every line regardless of currency, while listing multiple currencies in metadata. A 100 USD line and 200 KHR line become a meaningless 300 total.                                                                                                                                                                                                        | Reproduce through the real workbook with mixed-currency fixtures; currency-separated totals and cancelled/current-status inclusion policy. Do not introduce conversion rates or count deposits as revenue.                                                                                  |
| P9-11 | Medium stock/report correctness / source-confirmed         | Inventory report assembler reads sales/customer commitments under caller RLS; Warehouse/Viewer lack those sales rows. Empty reads can make reserved=0 and available=physical despite real commitments.                                                                                                                                                                                                    | Authorized narrow commitment aggregate or explicit unknown state; test all reader roles. Never widen raw customer/financial RLS just to populate a stock report.                                                                                                                            |
| P9-12 | Medium completeness/diagnostics / source-confirmed         | Several full-table sales/item/delivered/inquiry/follow-up/balance readers lack complete pagination and ignore returned errors. API row caps and denied/failed reads can produce incomplete analytics/export totals or measured-looking zero.                                                                                                                                                              | >1,000-row and injected-error/coverage probes; bounded complete aggregates and success/empty/error distinction, one helper group at a time. Existing list pagination does not solve this.                                                                                                   |
| P9-13 | Medium dashboard units/meaning / source-confirmed          | Production Today sums all production_output quantities but labels the result 张·钢筋网. Main Sales Today includes Draft. “Changed this month” prices count created_at. These are separate semantic defects/limitations, not fixed by gating.                                                                                                                                                              | Unit-separated output and explicitly labelled sales/date/status semantics with fixtures. Reuse P5.1 definitions rather than inventing new metrics.                                                                                                                                          |
| P9-14 | Medium release assurance / source-confirmed                | CI runs static verify and real local Supabase E2E jobs, but deployment is manual, not gated by db:drift. Schema validator scans concatenated history; optional SQL is only SELECT 1. Drift fingerprints cannot verify final policies/functions/backfills and unset DB URL skips it.                                                                                                                       | Pre-release fail-closed configuration/drift checklist, disposable full replay/catalog tests and recovery rehearsal. Keep every production check read-only; no auto-apply.                                                                                                                   |
| P9-15 | Medium test-observability / observed source behavior       | Existing RLS integration tests use `if (!canRun) return`, so Vitest can report test success without executing SQL assertions. Verify legitimately skips E2E without a backend. Passing static tests is not an all-role effective-RLS certificate.                                                                                                                                                         | Make environment skips observable and enforce real DB tests in the appropriate CI job; add missing inactive-account, race and direct-type probes.                                                                                                                                           |
| P9-16 | Low operational exposure / source-confirmed                | Cron accepts a secret query parameter as well as a constant-time Bearer header. Query secrets can enter access logs/history; errors use raw exception messages. No leaked credential was observed.                                                                                                                                                                                                        | Prefer header-based scheduler config and sanitized diagnostics; review compatibility before retiring query-secret support. Redact tokens, salary, customer details and connection strings.                                                                                                  |
| P9-17 | Low maintainability / source-confirmed                     | CLAUDE describes Next 15/Purchasing; current package is Next 16 and Purchasing is retired. Earlier security audit F0 describes an old validator replay bug already fixed. Historical checks also describe receipt UI retired by 0037.                                                                                                                                                                     | Treat historical docs as dated evidence; current source/P5.1 definitions govern. Do not rebuild removed or already-fixed features.                                                                                                                                                          |

## Dependency audit detail

Read-only npm audit ran against the registry without changing package.json or the
lockfile. Counts are vulnerable dependency entries, not nine independently
demonstrated exploits. Findings include next (critical), zod, sharp,
puppeteer-core, chromium-bidi, source-map-js and brace-expansion (high), and
exceljs/uuid (moderate). Observed installed versions: Next 16.3.2, Zod 3.25.76,
Sharp 0.35.4, Puppeteer Core 25.9.0 and ExcelJS 4.4.0.

Primary Next advisories include
[AVIF image optimization RCE](https://github.com/vercel/next.js/security/advisories/GHSA-2xp9-vwfh-vxw4)
and [typed-array use-cache RCE](https://github.com/vercel/next.js/security/advisories/GHSA-673q-mjm6-r5xr).
The former lists 16.3.3 as patched; the latter 16.4.1. Those isolated minimums
do not establish coverage of every other advisory: npm currently proposes
16.4.3 for the combined Next range. Recheck all applicable maintainer advisories
when selecting an upgrade. Source search found no use-cache/next-image/ImageResponse
usage in app code; that does not prove deployed framework endpoints or other
advisory paths are unreachable. Do not call the application compromised based
solely on version matching.

Npm proposes a Zod major upgrade and an ExcelJS downgrade for some transitive
findings. Do not run force-fix or blanket upgrades without compatibility review.
Dependency triage is the highest-priority next change before release; the already
reproduced, schema-free dashboard fix remains the only code fix in this increment.

## First fix: dashboard read and rendering boundaries

`src/app/(app)/dashboard/page.tsx` now gates employee/attendance queries and cards
on attendance:view, and SKU/family/location/balance/production-receipt queries and
cards on inventory:view. Production receipts belong to the stock ledger, so this
uses inventory permission rather than P4 planning permission. Entry still requires
stock:production and a warehouse location. Sales, inquiries, payroll and price
gates remain in place. Denied-domain placeholders never render as zero-valued
cards or false exceptions.

No grant, RLS policy, amount, stock posting, audit event, business-date rule,
calculation, persistent cache or new business module is introduced. Marketing
Admin's dashboard retains its header; navigation to Tasks remains available.

Measured request counts use the actual server page and installed Supabase query
builders with an intercepted deterministic transport (empty successful rows,
Special Price type present). They exclude auth/profile/locale/layout reads.
Before the fix, the new tests failed on forbidden calls; afterward all budgets
pass. These are actual controlled request counts, not observed production load
time, payload volume, SQL cost, p50/p95 or a claimed latency speedup.

| Role             | Before domain reads | After domain reads |
| ---------------- | ------------------- | ------------------ |
| Owner            | 21                  | 21                 |
| System Admin     | 21                  | 21                 |
| Attendance Admin | 9                   | 4                  |
| Warehouse Admin  | 9                   | 5                  |
| Sales Admin      | 20                  | 16                 |
| Marketing Admin  | 9                   | 0                  |
| Payroll Admin    | 10                  | 5                  |
| Viewer           | 9                   | 9                  |

The first eight unconditional helpers previously produced nine reads because MTD
attendance uses two HEAD counts. Five independent price counters plus a type
lookup/dependent counter are retained; reducing those needs separate measurement
and scope. Owner's request count is intentionally unchanged by an authorization fix.

New tests:

- `tests/integration/dashboard-permissions.test.ts`: real server-component
  rendering with query spies for all eight roles, sequential privilege change,
  failed user guard, both locales and production-entry permissions.
- `tests/integration/dashboard-request-cost.test.ts`: actual query builders and
  page orchestration, intercepted requests and role-specific budgets.
- `tests/e2e/dashboard-permissions.spec.ts`: eight real login/role scenarios on
  a mobile viewport, permitted/absent sections and overflow check; loopback-only
  account creation. These require the existing local Auth/database/browser stack.
- Existing `tests/unit/rbac.test.ts` and dashboard query tests remain unchanged
  and verify reusable permission/count/date logic.

## Broader performance, frontend and operational assessment

Reuse existing parallel dashboard queries, exact HEAD attendance counts,
Bangkok date cutoffs, request-scoped React auth caching, list pagination, batched
photo signing and 0053 RLS InitPlan optimizations. PDF already reuses a launch
promise/browser with request-owned pages; heavy Chromium/font packages are
server-external and traced for deployment. Do not replace these on assumption.

No live query plans or page timings were available. Existing ledger/date/FK,
delivery, inquiry follow-up/source/close, task employee/date/department, target
period and P4 indexes are present. An index is not justified by its absence
from a guessed list, and an unused-index report on an empty fixture is not
evidence to drop it. No indexes or persistent caches were changed.

Before P9.2/P9.3 optimization, record production-build request waterfalls,
role/filter/row-volume fixtures, server timings and cold/warm p50/p95. Capture
authorized read-only EXPLAIN (ANALYZE, BUFFERS) on disposable/staging SELECTs with
representative statistics. Compare the same dataset/workload and report payloads
as well as time. Do not EXPLAIN ANALYZE mutations or expose sensitive rows in logs.

Frontend source contains bounded animation/reduced-motion handling and responsive
dashboard grids. No application loading/error boundary files were found; default
framework handling does not provide per-card partial-failure UX. New role E2E
cases cover mobile section visibility, but touch/keyboard interaction, tablet,
hydration, actual layout shifts, accessibility audit and Core Web Vitals are
unmeasured. No rerender/chart/lazy-loading bottleneck is claimed without profiling.

Storage buckets remain private; employee signed photo URLs last 120 seconds and
salary/private-file role separation is retained in source. Operational attachments
have broad role/bucket policies, timestamp paths and upsert uploads: review
replacement/object-scope permissions and orphan handling with real Storage tests
before claiming isolation. No file policies were broadened. Server admin client
uses server-only; inventory scan found no direct import in a Client Component.
This is not a complete secret-history or generated-bundle scan.

All-domain security follow-up must exercise Owner, System Admin, Attendance,
Warehouse, Sales, Marketing, Payroll and Viewer through page/action/API/direct
PostgREST paths and expired/inactive sessions. Include anon RPC ACLs, views with
security_invoker, private storage signing, ownership changes, audit rollback and
role changes between requests. Current UI matrix and known RLS differences are
in [Security Permission Matrix](SECURITY_PERMISSION_MATRIX.md) and
[P5.1 KPI Definitions](DASHBOARD_KPI_DEFINITIONS.md). Existing tests are not an
exhaustive cross-product of all these operations.

Release controls already include static CI plus a local Supabase E2E job, no
automatic deploy, read-only migration drift checking and purchasing-retirement
recovery notes. Preserve the repaired retirement parser. Require a reviewed
database backup, pending-migration/effective-schema check, app-schema compatibility
and recovery procedure before any future manual release. An old-compatible app
rollback does not justify reversing ledger/history migrations. No production
migration was applied here. The installed Vercel CLI was reported outdated by the
session tooling; upgrading with `npm i -g vercel@latest` is strongly recommended
before future CLI operations, separately from this code change.

## Prioritized follow-up work

1. **Dependency security triage (P9.4 prerequisite):** review affected paths and
   patch Next/dependencies with compatible lockfile changes; rerun audit, verify
   and real E2E. Do not auto-fix major/downgrade suggestions.
2. **Inactive-account/direct-API authorization (P9.4):** reproduce P9-03/P9-04
   against final disposable schema; align active/type checks without widening
   sensitive access, then quotation and picker parity. Preserve legitimate grants.
3. **Audit/transaction integrity (P9.5/P9.7):** one atomic commercial workflow at
   a time, injected failures and event payload privacy; reconcile delete exception.
4. **Telegram and ledger concurrency (P9.5/P9.7):** durable send/claim semantics,
   two-session guard probes and safe retry/lock design.
5. **Correct reporting (P9.5):** mixed currency, permission-limited commitments,
   mixed production units and complete/error-aware source reads. Reuse P5.1 formulas.
6. **Measured P9.2/P9.3/P9.6:** establish live/staging baseline before further
   query/index/cache/frontend changes. No unsupported financial caching.
7. **Release/test observability (P9.7/P9.8):** explicit SQL skips, enforced local
   CI probes, sanitized diagnostics, fail-closed release checklist and recovery
   rehearsal. Then real all-role browser/RLS/export/mobile regression runs.

P9.2–P9.8 are not otherwise implemented. This audit does not close unresolved
security findings simply because the normal repository gate can pass.

## Verification and changed files

Final `npm run verify` passed in 31.3 seconds: `npm run format`, `npm run lint`,
`npm run typecheck`, `npm run test`, `npm run db:validate` and production build.
The first gate caught a TypeScript issue in new test mock setup; that was corrected
before this passing run. The focused dashboard/RBAC run executed 57 passing
tests. Markdown formatting and `git diff --check` also passed.

`npx playwright test tests/e2e/dashboard-permissions.spec.ts --list` discovered
eight cases; listing is not execution. Verify skipped E2E because local Supabase
was unreachable. Existing optional RLS tests cannot certify SQL assertion
execution without the backend. No live timing, EXPLAIN, real Auth/Storage or
all-role browser certification is claimed. `npm audit --omit=dev --json` ran
separately and exited 1 with the nine unresolved dependency findings above;
**the security audit is not clean**, despite the passing repository gate.

Files changed in this increment:

- Application: `src/app/(app)/dashboard/page.tsx` only.
- New regression files: `tests/integration/dashboard-permissions.test.ts`,
  `tests/integration/dashboard-request-cost.test.ts`,
  `tests/e2e/dashboard-permissions.spec.ts`.
- Documentation: this report, README, DEVELOPMENT_ROADMAP, architecture,
  data-dictionary, decisions, test-plan, SECURITY_PERMISSION_MATRIX,
  NEXT_PHASE_AUDIT and the P5.1 audit's later-update note.

Prior unrelated working-tree edits remain intact. No package/lockfile, migration,
RBAC grant or RLS policy was changed by this increment. No production action or
deployment was performed. Next recommended task: dependency security triage,
then inactive-account and direct-movement authorization regression probes.
