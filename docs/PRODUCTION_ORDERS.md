# P4.1 — Production orders

## Audit and scope

Existing reusable functionality: `production_output` movements and dashboard quick
entry; immutable stock ledger and per-location balances; confirmed sales lines
and derived deliveries; SKU master data; wire mesh drawings and exact-fit geometry
calculation; active employees; private attachments; bilingual app shell/forms.
Attendance and payroll remain independent of planning. Maintenance records do not
provide production-line capacity or throughput. No production-order table,
approval lifecycle, scheduling calendar or execution/QC record existed.

This increment adds planning documents only: create, edit drafts, review, approve,
hold/resume, cancel and browse status/due dates. It does not post finished stock,
deduct raw materials, create tasks/notifications, or implement P4.2–P4.8. Purchasing
stays removed. Numbering uses `PRD-{business-year}-{global sequence padded to at
least eight digits}`, separate from retired purchasing numbers. Counters do not
reset; cancelled numbers are never reused and sequence gaps are expected.

## Workflow and deliberate boundaries

- Warehouse Admin and Owner create/manage drafts. Owner approves. System Admin
  and Sales Admin view only; other roles have no production access. These new
  `production:*` grants are mirrored by the additive migration's policies and
  database guards. Existing sales, customer and employee RLS is unchanged.
- A plan covers one SKU and either one confirmed/partially delivered sales line
  or an internal replenishment request with a required reason. Owner approval is
  required for either origin. Sales plans must match the line's SKU/unit and
  cannot exceed its currently undelivered quantity when saved/approved.
- Only one non-cancelled plan may reference a sales line. This intentionally
  prevents duplicate active production commitments. Future partial execution
  runs belong under that plan, rather than creating competing production orders.
  Cancelling a plan permits a replacement without deleting its history.
- Each browser create form has a stable UUID. The create RPC serializes retries
  for that UUID and returns the existing order for an identical original payload;
  a different payload or creator is rejected. Opening a fresh internal-request
  form is a new request, not semantic deduplication against all prior requests.
- Plans require an existing drawing. Sales plans use a drawing linked to the same
  order or its quotation; internal plans may reuse a drawing as an engineering
  template without inheriting its customer. Draft saves refresh geometry from the
  selected drawing. Approval freezes the saved snapshot, so later drawing edits
  cannot change an approved plan. The Owner must review that drawing geometry
  matches the selected SKU: existing free-text SKU attributes do not establish an
  automatic engineering equivalence or a drawing-to-sales-line relationship.
- Wire counts and planned m² derive from the snapshot and planned sheets using
  `calculateWireMesh`. The SQL guard independently rejects non-exact fits. Wire
  counts across width are longitudinal wires; counts across length are transverse
  wires. No BOM/weight/yield formula is invented.
- `planned_line` is an optional human reference, not a machine reservation or
  throughput estimate. Supervisor is an optional active employee reference, not a
  login/profile identity. P4.2 will introduce actual line scheduling separately.
- Attachments reuse the private `attachments` bucket and short-lived signed URLs.
  A draft retains its prior path unless replaced; save waits for a pending upload.
- Draft editing has a separate screen from review/approval. Approved plans are
  immutable except status transitions. Holds/cancellations require reasons.
  Resuming returns to the held-from state; restoring Approved requires Owner.
  Cancellation is terminal. There is no Completed transition in this increment
  because execution, QC and output reconciliation have not been implemented.
- Updates use a version predicate to reject stale browser writes. Database
  triggers enforce actor/approval/source/snapshot rules even through direct API
  writes, increment versions, and atomically append old/new planning metadata to
  `audit_log`. If audit insertion fails, the planning mutation rolls back. Neither
  planning records nor their history may be hard-deleted.

## Security and data access

`production_orders` has RLS, explicit grants and no authenticated delete grant.
Source reads for factory users use a deliberately narrow public invoker wrapper
over `production_private.reference_options`, a role-checked definer helper with
an empty search path. Trigger helpers also live in that non-exposed schema.
**Do not add `production_private` to Supabase's exposed API schemas.** Public
RPCs are not executable by anon/PUBLIC; each helper verifies an active profile.

Planning lookups expose at most 30 searchable id/label matches (plus source SKU
identity where necessary). They expose no prices, customer tax/contact data,
employee pay, private photos or documents. Source-linked plans retain only the
customer name/order reference needed by the factory. Warehouse users still
cannot read raw commercial order rows. The list uses exact counts and 20-row
server pagination/status filtering; detail reads one record and edit-only
lookups load concurrently. No cross-user or persistent auth cache is introduced.

## Migration and verification

Additive migration: `20261030041812_production_orders.sql`. It introduces one
planning table, one independent sequence, the private helper schema, policies,
guard/audit triggers, idempotent-create RPC and bounded reference RPC. It does not
alter stock movements, commercial records, attendance, payroll or private storage
policies, and does not backfill historical production orders.

The migration was authored with the CLI's migration-new workflow and tested by
replaying the full migration chain in a disposable PostgreSQL 17 instance with
minimal Supabase auth/storage stubs, then `tests/sql/production-orders.sql`.
This is not evidence that a deployed Supabase schema has been changed. Production
application/deployment remain separate human-approved operations.

Acceptance **#41** in `test-plan.md` covers the workflow. Unit tests cover states,
geometry, validation, dates, translations and role grants; integration tests cover
the actual Supabase query builder/actions/CAS/errors/pagination. SQL probes cover
effective RLS for all eight roles, private helper exposure, source/quantity guards,
idempotency, audit rollback, immutable approved geometry, cancellation and unchanged
stock. Two-connection probes test same-request retries and competing sales plans.
Playwright covers a source-backed draft/edit/approve/cancel flow on a mobile viewport
and checks that stock-movement counts do not change. Browser execution requires
local Supabase and the migration; a skipped browser run is not a pass.

Verified results for this increment:

- `npm run verify` passed format, lint, typecheck, unit/integration tests, schema
  validation and production build (30.4 seconds on the final application changes).
- The 17 focused P4.1 unit/integration tests passed. The final SQL snapshot fix
  was independently reverified with the complete 63-migration replay and SQL/race
  probes. SQL fixtures expect a disposable migration-only database without seed.
- Effective policies were tested for all eight roles; failed audit insertion
  rolled back the plan write; approved drawing/customer snapshots remained frozen.
- Two concurrent identical requests created one audited plan; two competing
  requests for one sales line produced one winner; stock totals/counts were unchanged.
- Supabase advisors ran against that disposable database. New foreign-key index
  findings were fixed. No P4 security/WARN/ERROR findings remain. Its ten remaining
  P4 INFO findings are unused-index observations on fresh fixture data, not
  representative workload evidence. There were 166 other findings on legacy/stub
  objects; this is not a production-wide advisor clearance.
- The new Playwright test is discoverable, but execution auto-skipped because local
  Supabase was unreachable. Browser behavior/mobile layout are not certified by
  this run. No migration was applied to production and no deployment was made.

## Changed implementation files

- UI: `src/app/(app)/production/page.tsx`, `new/page.tsx`, `[id]/page.tsx`,
  `[id]/edit/page.tsx`, `production-form.tsx`; shell navigation and the shared
  attachment field (existing-path preservation and pending-upload callback).
- Logic: `src/lib/domain/production-orders.ts`, `src/lib/actions/production-orders.ts`,
  `src/lib/db/production-queries.ts` exported through `queries.ts`, plus RBAC,
  validation and i18n dictionaries.
- Database/tooling: the single additive migration above and new production
  invariant checks in `scripts/validate-schema.mjs`.
- Coverage: production unit, integration, Playwright and SQL files named above.
- Docs: this assessment, product spec, architecture, data dictionary, decisions,
  operations runbook, test plan and roadmap. Earlier Phase 2/3 working-tree changes
  are retained; they are not part of the P4.1 implementation.

## Remaining phases

P4.2: configured lines, availability, calendars, conflict/throughput rules.
P4.3: configurable manufacturing stages, partial actual output, operators/downtime.
P4.4: approved engineering material/yield formulas and estimates only.
P4.5: QC inspections, defects and acceptance.
P4.6: explicitly approved, idempotent ledger output posting with production links.
P4.7: role-scoped production KPIs after actual execution data exists.
P4.8: PDF/Excel and optional Telegram, after its existing concurrency/retry issue
is addressed. None of these phases is implied by approving a planning document.
