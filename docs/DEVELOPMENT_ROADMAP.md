# Development Roadmap — Zysteel Operations

Source: Phase 1 audit (2026-10-16), verified against the live `npm run verify`
run and the actual repo state, not assumptions. This is a living document —
update the checklist and phase status as work lands, same convention as
`docs/decisions.md`.

**Ground rules carried over from the audit brief, binding for every phase
below:** reuse existing modules/tables before adding new ones; no rewrites;
no schema-breaking changes without approval; never touch purchasing's
header-only/no-auto-receiving design or auto-consume raw materials without
explicit sign-off; every schema change updates `docs/data-dictionary.md` in
the same change (per `AGENTS.md` rule 5); every behavior change ships with a
test; nothing is "done" while `npm run verify` is red.

## Prioritized task checklist

- [ ] **1.1** Fix documentation drift (README, decisions.md, product-spec.md) — *Critical, smallest safe first change*
- [ ] **1.2** Close the deploy/migration-drift gap
- [ ] **1.3** Systematic RBAC × RLS cross-check
- [ ] **2.1** Permission-gate the Dashboard's attendance/inventory/production sections
- [ ] **2.2** Add a Team Tasks summary widget to the Dashboard
- [ ] **2.3** Profile Dashboard query load (investigate only — don't fix an unconfirmed problem)
- [ ] **3.1** "Create task" shortcut from Customer / Sales Inquiry records
- [ ] **3.2** Weekly/monthly task cadence (beyond single-business-date tasks)
- [ ] **3.3** Calendar view + Task Templates (already-deferred items — revisit on demand)
- [ ] **4.1** Decide + scope a real Production module (planning, planned-vs-actual, scrap/defects)
- [ ] **4.2** Verify/enhance low-stock alerting end-to-end (dashboard + Telegram)
- [ ] **5.1** Weekly/Monthly Team Performance report (PDF/Excel)
- [ ] **5.2** Spot-check existing PDF/Excel exports for content accuracy
- [ ] **6.1** Team Tasks summary in the daily Telegram report
- [ ] **6.2** Two-way Telegram task updates (optional — only if the "no employee login" decision is revisited)

**First three tasks to implement:** 1.1 → 1.2 → 1.3 (in that order — each is
low-risk and makes every later phase's planning more trustworthy).
**Smallest safe first change: 1.1.** Pure documentation edits, zero
application code or schema touched, nothing to regress, immediately testable
by re-reading the files.

---

## Phase 1 — Critical: Data Integrity, Security, Process

### 1.1 Fix documentation drift

- **Priority:** Critical (trust foundation for every other phase)
- **Current problem:** `README.md` and `docs/decisions.md` both state
  Purchasing/Sales/Payroll/Reports are "navigation placeholders" from a
  "First pass" that shipped long ago — all four are fully built and in daily
  use. `docs/product-spec.md`'s roadmap stops at "Eighth pass"
  (~migration 0024) while the repo is at migration 0059 — roughly 35
  migrations of undocumented passes (CRM/pipeline, Sales Targets/KPI/
  Commission, Price Records, Maintenance, Quotations, Customer Types, RLS
  performance rewrite, Attendance Office/Factory split, the entire Team Task
  module). README's stack section says Next.js 15; installed is 16.3.2.
  `docs/test-plan.md` describes e2e as requiring `PLAYWRIGHT=1`; the actual
  `scripts/verify.mjs` auto-detects local Supabase and runs it automatically.
- **Proposed solution:** Rewrite the "Status" section of `README.md`, the
  completion table in `docs/decisions.md`, and add the missing passes
  (Ninth onward) to `docs/product-spec.md`'s roadmap section, summarizing
  each already-shipped feature in the same style as the existing entries.
  Correct the stack version line and the e2e-triggering description.
  `docs/data-dictionary.md` needs no changes — it's already current.
- **Files affected:** `README.md`, `docs/decisions.md`, `docs/product-spec.md`,
  `docs/test-plan.md`. No application code, no schema.
- **Dependencies/risks:** None. Pure prose edits.
- **Acceptance criteria:** Every module listed as "built" in these docs
  matches what's actually in `src/`; version numbers match `package.json`;
  the e2e description matches `scripts/verify.mjs`'s real behavior.
- **Tests required:** None (no behavior change). Verification is a read-through
  comparing doc claims against `git log --oneline` / the migrations folder /
  `package.json`.

### 1.2 Close the deploy/migration-drift gap

- **Priority:** Critical — the same root cause has caused three separate live
  production errors this session (Telegram "column not in schema cache",
  Tasks module "table not in schema cache", Marketing Admin "invalid enum
  value"), all because code and Supabase migrations deploy via two
  independent manual steps with nothing enforcing they happen together.
- **Current problem:** `vercel --prod --yes` ships code; applying
  `supabase/migrations/*.sql` to production is a separate, manual SQL-Editor
  step. No warning exists when they drift apart.
- **Proposed solution (smallest safe version):** A read-only script
  (`scripts/check-migration-drift.mjs`, modeled on the existing
  `scripts/validate-schema.mjs`) that connects to `SUPABASE_DB_URL` (when
  set — same pattern `validate-schema.mjs` already uses) and reports which
  local migration files haven't been applied to that database, without
  applying anything itself. Add a short checklist to
  `docs/operations-runbook.md`: run this check (or the `information_schema`/
  `pg_enum` queries already used to diagnose this session's incidents)
  immediately after every `vercel --prod --yes`, before telling the user a
  feature is live. A fancier option (auto-apply pending migrations as part
  of deploy) is a separate, larger task — flagging it as an option, not
  proposing it without your sign-off given it touches the deploy path.
- **Files affected:** new `scripts/check-migration-drift.mjs`;
  `docs/operations-runbook.md` (new checklist section); no application code,
  no schema.
- **Dependencies/risks:** Needs `SUPABASE_DB_URL` (or equivalent) for the
  production database available to whoever runs it — never commit that
  value; read-only by design so it can't itself cause drift or damage.
- **Acceptance criteria:** Running the script against a database missing a
  known-pending migration reports it by filename; running it against a
  fully-migrated database reports clean.
- **Tests required:** A unit/integration test exercising the script's parsing
  logic against a fixture list of "applied" vs. "available" migrations
  (no real DB connection needed for that part); manual verification against
  local Supabase for the live-DB path.

### 1.3 Systematic RBAC × RLS cross-check

- **Priority:** High (adjacent to Critical — this exact gap caused a real,
  if locally-caught, bug for the Marketing Admin role)
- **Current problem:** Granting a permission in `src/lib/domain/rbac.ts` is
  necessary but not sufficient — a role also needs RLS access to every table
  its pages actually query. This was only caught for Marketing Admin by
  manually logging in as that role and clicking through the New Task form;
  nothing currently catches this class of gap automatically.
- **Proposed solution:** Extend `scripts/validate-schema.mjs` (same
  static-analysis approach already used there) with a check that, for each
  role granted a `*:manage`/`*:view` permission implying access to table X,
  confirms an RLS policy on X actually includes that role. This can start
  narrow (hardcode the known permission→table map, matching how the
  `tasks_select`/`employees_select` checks already added this session work)
  rather than attempting full static inference.
- **Files affected:** `scripts/validate-schema.mjs` only.
- **Dependencies/risks:** A hardcoded permission→table map needs updating
  whenever a new permission or table is added — document this obligation
  next to the map itself so it isn't silently skipped later.
- **Acceptance criteria:** The new checks fail loudly if a future migration
  removes a role from a table's RLS policy without removing the matching
  `rbac.ts` grant (or vice versa).
- **Tests required:** None beyond the script itself being exercised by
  `npm run db:validate`, which already runs in `npm run verify`.

---

## Phase 2 — Dashboard Performance & Reliability

### 2.1 Permission-gate the Dashboard's attendance/inventory/production sections

- **Priority:** Medium-High
- **Current problem:** The Dashboard's top section (morning/afternoon
  attendance, MTD rate, production count, inventory totals, low stock,
  attendance exceptions **by name**) has no permission check at all — any
  authenticated user sees it, including Viewer and the new Marketing Admin,
  regardless of role. Only the bottom "business stats" row (Sales/Purchasing/
  Payroll/Inquiries cards) is actually gated.
- **Proposed solution:** Wrap each top-section block in the same
  `hasPermission(user.role, '...')` pattern already used for the bottom row
  (e.g. `attendance:view` for the attendance cards and exceptions card,
  `inventory:view` for inventory totals/low stock, `stock:production` or
  `inventory:view` for production count). Roles that lack all of them simply
  see fewer cards, same graceful-degradation pattern already proven in the
  bottom row.
- **Files affected:** `src/app/(app)/dashboard/page.tsx` only.
- **Dependencies/risks:** Must not accidentally hide cards from roles that
  currently rely on seeing them (Owner/System Admin/Attendance Admin/
  Warehouse Admin all already have the relevant permissions, so no
  regression expected — verify explicitly per role as part of testing).
- **Acceptance criteria:** A Marketing Admin or Viewer dashboard no longer
  shows attendance-exceptions-by-name, inventory totals, or production
  count; Owner/System Admin/Attendance Admin/Warehouse Admin dashboards are
  unchanged.
- **Tests required:** New Playwright coverage (or extend an existing
  dashboard spec if one exists) logging in as a low-permission role and
  asserting the gated cards are absent; existing dashboard-adjacent e2e
  specs must stay green.

### 2.2 Add a Team Tasks summary widget to the Dashboard

- **Priority:** Medium
- **Current problem:** The Dashboard shows nothing about Team Tasks — the one
  thing Marketing Admin and Sales Admin's Tasks access is actually for.
- **Proposed solution:** A small card (today's planned/completed/overdue
  count, linking to `/tasks/today`), gated by `tasks:view`, reusing
  `buildEmployeePerformanceRows`/`buildTeamOverview`
  (`src/lib/domain/task-performance.ts`) and `getTasksForRange`/
  `getDailyMetricsForRange` (`src/lib/db/queries.ts`) — all already built for
  `/tasks/today`, no new domain logic needed.
- **Files affected:** `src/app/(app)/dashboard/page.tsx` (new card); no new
  queries or domain functions.
- **Dependencies/risks:** Low — purely additive, reuses existing, already-
  tested functions.
- **Acceptance criteria:** A user with `tasks:view` sees today's task
  counts on the Dashboard; a user without it does not see the card.
- **Tests required:** Extend dashboard e2e coverage to assert the card
  appears/is absent per role, mirroring 2.1's test approach.

### 2.3 Profile Dashboard query load

- **Priority:** Low — investigation only, not a confirmed problem
- **Current problem:** The Dashboard runs ~14 parallel Supabase queries on
  every load (`force-dynamic`, no caching) — this may be fine at current
  data volume, but hasn't been profiled. Not claiming it's slow without
  evidence.
- **Proposed solution:** Add basic timing/logging around the dashboard's
  `Promise.all` during a staging check, or use Vercel's own function
  timing, before deciding whether any caching/consolidation is warranted.
- **Files affected:** None yet — this is a measurement task, not a code
  change.
- **Dependencies/risks:** None — read-only investigation.
- **Acceptance criteria:** A clear answer, with numbers, to "is this
  actually slow" — only then would a follow-up task get scoped.
- **Tests required:** None for the investigation itself.

---

## Phase 3 — Sales CRM & Team Task Tracking

### 3.1 "Create task" shortcut from Customer / Sales Inquiry records

- **Priority:** Medium
- **Current problem:** Tasks can reference a `customer_id`, but only in the
  direction of picking a customer *from* the Tasks page — there's no "create
  a follow-up task" action from a Customer or Sales Inquiry record itself,
  which is where a salesperson would naturally think to create one.
- **Proposed solution:** A "New task" button on the Customer detail and
  Sales Inquiry detail views, pre-filling `customerId` (and, for an inquiry,
  a sensible default title/department) in the same `TaskForm` dialog already
  used on `/tasks` — reuse, not a new form.
- **Files affected:** Customer detail page/component, Sales Inquiry detail
  page/component (under `src/app/(app)/sales/`); `src/lib/actions/tasks.ts`
  and `TaskForm` reused as-is or with an optional pre-fill prop.
- **Dependencies/risks:** Needs `tasks:manage` — already correctly scoped to
  `sales_admin`/`marketing_admin`/`owner`; no RLS changes expected since this
  reuses the existing `createTask` action untouched.
- **Acceptance criteria:** Creating a task from a Customer/Inquiry page
  produces a task on `/tasks` and `/tasks/today` with the customer link
  already set, identical in every other respect to one created from the
  Tasks page directly.
- **Tests required:** Unit test for any new pre-fill helper (if one is
  added); e2e coverage for the new button's happy path.

### 3.2 Weekly/monthly task cadence

- **Priority:** Medium
- **Current problem:** Every task has exactly one `business_date` — there's
  no way to represent "a recurring weekly task" or "a monthly task," which
  the original request explicitly asked for ("Daily, weekly, and monthly
  tasks").
- **Proposed solution:** Needs a product decision before design: does
  "weekly/monthly task" mean (a) a single task spanning a date range rather
  than one day, or (b) a recurring template that auto-generates daily task
  rows? Option (b) overlaps with the already-deferred Task Templates item
  (3.3) — recommend deciding both together rather than building twice.
  **Flagging for your input before scoping further**, consistent with "do
  not modify important business logic without approval."
- **Files affected:** Likely `supabase/migrations/`, `src/lib/domain/tasks.ts`,
  `tasks-board.tsx` — not fully scoped pending the decision above.
- **Dependencies/risks:** Schema change — needs explicit sign-off per your
  rules before any migration is written.
- **Acceptance criteria:** TBD pending the product decision.
- **Tests required:** TBD pending the product decision.

### 3.3 Calendar view + Task Templates

- **Priority:** Low (already deliberately deferred when the Tasks module
  shipped, with your agreement — not forgotten, just not yet requested)
- **Current problem:** N/A — deferred scope, not a bug.
- **Proposed solution:** Revisit together with 3.2 if/when you want it;
  no action until then.
- **Files/Dependencies/Acceptance/Tests:** Not scoped — would be designed
  fresh when prioritized.

---

## Phase 4 — Inventory & Production Workflow

### 4.1 Decide + scope a real Production module

- **Priority:** Medium — decision-first, not a build-first task
- **Current problem:** "Production" today is only the `production_output`
  stock-movement type plus a dashboard quick-entry widget — no planning, no
  planned-vs-actual tracking, no scrap/defect recording, no dedicated
  production reports, despite this being explicitly requested.
- **Proposed solution:** Before any code: confirm with you what "planning"
  actually means operationally (a daily/weekly output target per SKU or
  family? a simple scrap-quantity field on the existing production-output
  entry? a separate planned-vs-actual report?). This keeps scope minimal and
  avoids guessing at business rules, per `AGENTS.md`'s own instruction not
  to.
- **Files affected:** TBD pending scope decision — likely a new
  `production_plans`-style table (additive) and an extension to the existing
  `ProductionQuickEntry` component rather than a parallel system.
- **Dependencies/risks:** Schema change — needs explicit sign-off; must not
  alter how `production_output` movements currently post to the ledger.
- **Acceptance criteria:** TBD pending scope decision.
- **Tests required:** TBD pending scope decision.

### 4.2 Verify/enhance low-stock alerting end-to-end

- **Priority:** Low-Medium
- **Current problem:** Low stock is visible on the Dashboard and Inventory
  page; whether the daily Telegram inventory report calls out low-stock
  items prominently (vs. just listing totals) hasn't been specifically
  re-verified this pass.
- **Proposed solution:** Read `src/lib/domain/reports.ts`'s
  `renderInventoryReport` to confirm current behavior before proposing any
  change — may already be sufficient.
- **Files affected:** Possibly `src/lib/domain/reports.ts` if a gap is
  confirmed; none otherwise.
- **Dependencies/risks:** Low.
- **Acceptance criteria:** TBD pending the read-through.
- **Tests required:** TBD pending the read-through.

---

## Phase 5 — Management Reports & Exports

### 5.1 Weekly/Monthly Team Performance report (PDF/Excel)

- **Priority:** Medium
- **Current problem:** `/tasks/weekly` shows team performance on-screen only
  — no exportable report, unlike Sales/Inventory/Purchasing/Payroll, which
  all have PDF/Excel export via `/api/export/*`.
- **Proposed solution:** New `/api/export/tasks-weekly` (PDF + Excel),
  following the exact existing pattern in `src/lib/reports/pdf.ts` and the
  sibling `/api/export/*` routes — reuses `buildEmployeePerformanceRows`/
  `buildTeamOverview`, no new domain logic.
- **Files affected:** New `src/app/api/export/tasks-weekly/route.ts` (and
  `/pdf` variant, matching existing naming); `src/lib/reports/pdf.ts` gains
  a render function for this report shape.
- **Dependencies/risks:** Low — purely additive, follows an established
  pattern exactly.
- **Acceptance criteria:** Export buttons on `/tasks/weekly` produce a PDF
  and an Excel file matching the on-screen numbers exactly.
- **Tests required:** Integration test mirroring the existing
  `inventory-report-render.test.ts` style; e2e coverage mirroring
  `inventory-report.spec.ts`'s "exposes PDF and Excel export links" check.

### 5.2 Spot-check existing PDF/Excel exports for content accuracy

- **Priority:** Low
- **Current problem:** Existing e2e coverage confirms export *links* work;
  it doesn't deeply verify every report's *content* is still correct after
  recent schema changes (salesperson field, customer filters, etc.).
- **Proposed solution:** A manual or lightly-scripted pass opening each
  export type against known seed data and checking the numbers, not a new
  feature.
- **Files affected:** None unless a real bug is found.
- **Dependencies/risks:** None.
- **Acceptance criteria:** A short written confirmation (or bug list) per
  export type.
- **Tests required:** Add any gap found to the relevant integration test.

---

## Phase 6 — Telegram Notifications & Automation

### 6.1 Team Tasks summary in the daily Telegram report

- **Priority:** Low-Medium
- **Current problem:** Telegram reporting (attendance, inventory) doesn't
  mention Team Tasks at all, despite Tasks being a new, actively-used
  module.
- **Proposed solution:** Optionally append a short "today's tasks: N
  planned, N completed, N overdue" line to an existing scheduled report, or
  add it as a fourth, separately-toggleable Telegram destination — needs
  your preference on which, matching how Office/Factory destinations were
  decided earlier (AskUserQuestion-style choice, not assumed).
- **Files affected:** `src/lib/reports/service.ts`, `src/lib/domain/
  report-schedule.ts`, possibly a new migration if it becomes its own
  destination (same shape as `0054`/`0056`).
- **Dependencies/risks:** Schema change only if it becomes its own
  destination — needs sign-off either way per your rules on Telegram/
  business-logic changes.
- **Acceptance criteria:** TBD pending your preference.
- **Tests required:** TBD pending your preference.

### 6.2 Two-way Telegram task updates

- **Priority:** Low — optional, was already considered and not chosen
- **Current problem:** N/A.
- **Proposed solution:** Only revisit if the "no employee login, manager
  enters tasks for the team" decision (made when the Tasks module shipped)
  is itself revisited — two-way Telegram is a real alternative to giving
  every employee a login, but is meaningfully more backend work (webhook
  handling, message parsing) than the current one-way reporting.
- **Files/Dependencies/Acceptance/Tests:** Not scoped — would be designed
  fresh when/if prioritized.
