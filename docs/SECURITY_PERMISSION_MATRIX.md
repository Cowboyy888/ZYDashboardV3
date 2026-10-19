# Security Permission Matrix — RBAC ↔ RLS Audit

Audit date: 2026-10-17. Scope: every role, every table's RLS policy, Storage
bucket policy, and SECURITY DEFINER function, cross-referenced against
`src/lib/domain/rbac.ts` (the app's single source of truth per `CLAUDE.md`)
and the actual action code that calls it. Live RLS state was read directly
from a freshly-`db reset` local Supabase Postgres (`pg_policies`,
`pg_proc`, `pg_enum`, `information_schema`) — migration files are historical
record, not proof of current behavior, so every claim below was verified
against the live catalog, not just the SQL source.

**Everything in this document is read-only findings. No RLS policy, RBAC
grant, or application code was changed as part of this audit.**

## 1. Roles — confirmed exhaustive

`rbac.ts`'s `ROLES` and the live `app_role` Postgres enum were compared
directly (`select enumlabel from pg_enum ... where typname = 'app_role'`).
Both list exactly these 8 values, no more, no less:

`owner`, `system_admin`, `attendance_admin`, `warehouse_admin`,
`sales_admin`, `marketing_admin`, `payroll_admin`, `viewer`.

No undiscovered role exists anywhere in the schema (also confirmed: no other
enum type with `role` in its name).

## 2. Permission matrix by domain

Legend: **V**iew, **C**reate, **E**dit, **A**pprove, **D**elete. `●` =
granted (app `Permission` + matching RLS), `○` = not granted, `⚠` = granted
at one layer but not the other (see Findings). Owner is omitted from every
row — it holds every permission unconditionally (`hasPermission`'s
`owner` sentinel) and RLS treats `owner` identically everywhere.

### Employee records & attendance

| Role | Employees V | Employees E | Sensitive (salary/docs) V | Sensitive E | Attendance V | Attendance E |
| --- | --- | --- | --- | --- | --- | --- |
| system_admin | ● | ● | ● | ● | ● | ⚠ (RLS only, see F6) |
| attendance_admin | ● | ○ | ○ | ○ | ● | ● |
| warehouse_admin | ○ | ○ | ○ | ○ | ○ | ○ |
| sales_admin | ⚠ (RLS only, see F1) | ○ | ○ | ○ | ○ | ○ |
| marketing_admin | ⚠ (RLS only, see F1) | ○ | ○ | ○ | ○ | ○ |
| payroll_admin | ● | ○ | ● | ● | ● | ○ |
| viewer | ● | ○ | ○ | ○ | ● | ○ |

No hard delete exists for employees or attendance anywhere (no DELETE RLS
policy on either table; `attendance` additionally has
`trg_attendance_no_delete`). Matches the no-hard-delete rule.

### Inventory / stock

| Role | Inventory V | Opening | Production | Stock-out | Adjust | Transfer | Override negative |
| --- | --- | --- | --- | --- | --- | --- | --- |
| warehouse_admin | ● | ● | ● | ● | ● | ● | ○ |
| sales_admin | ● | ○ | ○ | ○ | ○ | ○ | ○ |
| system_admin | ● | ○ | ○ | ○ | ○ | ○ | ○ |
| viewer | ● | ○ | ○ | ○ | ○ | ○ | ○ |
| others | ○ | ○ | ○ | ○ | ○ | ○ | ○ |

`stock:override_negative` has no role grant in `rbac.ts` by design — only
`owner` can override (via the sentinel), matching `enforce_stock_rules()`'s
DB-level guard. **RLS caveat: see F3** — the `stock_movements` INSERT
policy's role check is broader than this table suggests for `sales_admin`/
`system_admin`, in a way the app itself never exercises except through one
narrow, safe RPC.

### Customers / sales orders / deliveries / payments

| Role | Customers V | Customers E | Sales orders V | Sales orders E (create/deliver) | Quotations V | Quotations E | Payments V | Payments E |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| sales_admin | ● | ● | ● | ● | ● | ● | ● | ● |
| system_admin | ● | ○ | ● | ○ | ● | ⚠ (RLS only, see F2) | ● | ○ |
| marketing_admin | ⚠ (RLS only, see F1) | ○ | ○ | ○ | ○ | ○ | ○ | ○ |
| others | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ |

### Marketing records / team tasks

| Role | Tasks V | Tasks C/E | Daily metrics V | Daily metrics E |
| --- | --- | --- | --- | --- |
| sales_admin | ● | ● | ● | ● |
| marketing_admin | ● | ● | ● | ● |
| system_admin | ● | ○ | ● | ○ |
| others | ○ | ○ | ○ | ○ |

This domain (migration `0056`) matches exactly, role for role, command for
command, between `rbac.ts` and RLS. No finding.

`daily_marketing_reports`/`daily_sales_reports`/`marketing_settings`/
`construction_projects`/`competitor_prices` are a **separate, older, and
currently unused** set of tables — see F5. They are not part of the Team
Tasks feature despite the overlapping name.

### Payroll / salary

| Role | Payroll V | Payroll E | Approve | Commission V (orphaned, see F5) |
| --- | --- | --- | --- | --- |
| payroll_admin | ● | ● | ○ | ⚠ (RLS only) |
| system_admin | ● | ○ | ○ | ⚠ (RLS only) |
| owner | ● | ● | ● | ● |
| others | ○ | ○ | ○ | ○ |

`payroll:approve` has no role grant by design — approving a run is
Owner-only both in `rbac.ts` (sentinel) and at the DB level
(`enforce_payroll_run_immutable()` requires `auth_role() = 'owner'` for the
draft→approved transition). Confirmed matching.

### Purchasing / suppliers

| Role | Purchasing V | Purchasing E (create/receive) | Suppliers V | Suppliers E |
| --- | --- | --- | --- | --- |
| warehouse_admin | ● | ● | ● | ● |
| system_admin | ● | ○ | ● | ○ |
| others | ○ | ○ | ○ | ○ |

Matches exactly. `purchase_order_items` RLS exists but the table is
documented dormant in `docs/data-dictionary.md` already — not a new finding.

### Reports / administration / audit logs

| Role | Dashboard/Reports V | Settings V/E | Users E | Telegram manage | Telegram send | Audit V |
| --- | --- | --- | --- | --- | --- | --- |
| system_admin | ● | ●/● | ● | ● | ● | ● |
| attendance_admin | ● | ○/○ | ○ | ○ | ● | ○ |
| warehouse_admin | ● | ○/○ | ○ | ○ | ● | ○ |
| everyone else | ● | ○/○ | ○ | ○ | ○ | ○ |

`audit_log` insert is self-attributed only (`actor_id = auth.uid()`, no role
check — every authenticated user's own actions get logged; this is correct,
matching migration `0024`'s own hardening of this exact policy). Matches.

## 3. Confirmed findings

Ranked by severity. None required weakening any policy to produce a passing
test — every test added in this change asserts the **current**, real
boundary.

### F0 — HIGH (tooling/process, not production): `npm run verify`'s schema step silently reverts live RLS policies to older, less-secure definitions on every local run

**This was discovered by accident while running this very audit** — a
`pg_policies` check that had passed minutes earlier started showing
`audit_insert` and `movements_insert` reverted to older definitions, with no
code change in between. Traced to a confirmed, reproducible root cause, not
a one-off glitch:

1. `.env.local` sets `SUPABASE_DB_URL` to the local Postgres connection
   string (reasonable — it's what lets `scripts/validate-schema.mjs` do an
   optional live syntax check).
2. `scripts/verify.mjs` loads `.env.local` (`loadEnvFiles()`) and passes its
   full `process.env` — including `SUPABASE_DB_URL` — to every step it
   shells out to, including the `schema` step (`node
   scripts/validate-schema.mjs`).
3. Whenever `SUPABASE_DB_URL` is set, `validate-schema.mjs` (lines ~406-419)
   unconditionally re-applies **every** migration file from `0001` onward,
   via separate `psql -f <file>` calls, against whatever database that URL
   points at — with no check for whether that database is already fully
   migrated.
4. Migrations in this repo were authored to run **once**, in order, against
   a progressively-evolving schema — they are not safe to replay from
   scratch on top of their own final state. Reproduced directly: replaying
   from `0001` against an already-`db reset` local database applies cleanly
   through `0011`, then **fails outright at `0012_telegram_destinations.sql`**
   (`ERROR: column "chat_id" does not exist` — that migration assumes a
   column shape a later migration already changed).
5. Because each migration file is its own separate `psql -f` call (not one
   wrapped transaction) and the whole loop is wrapped in
   `try { ... } catch { console.log('(skipped live apply...)') }`, the
   failure at `0012` is **silently swallowed** — `npm run verify` still
   prints `schema … ok`. But migrations `0001`-`0011` already committed
   for real before the loop died, and some of them unconditionally
   `drop policy / create policy` objects that a **later** migration (after
   `0012`) had since redefined — reverting those specific policies to their
   original, older form with no warning. Confirmed concretely for two:
   `audit_insert` (hardened in `0024`, reverted back to its pre-0024,
   forgeable `auth.uid() is not null` form) and `movements_insert`
   (widened in `0014` to add `sales_admin`, reverted back to its pre-0014
   form that excludes `sales_admin` entirely).

**Impact:** local-dev-only — production is deployed by hand via the SQL
Editor per this repo's own docs, never through this script. But it means
**every local run of `npm run verify` silently downgrades the local
database's RLS policies**, and anyone doing security testing, manual QA, or
even just normal feature work against their local Supabase right after a
`verify` run is working against a quietly-regressed security posture until
their next `supabase db reset`. This is almost certainly the real
explanation for more than one "the database looks wrong" moment earlier in
this project's history that was written off as drift — it was this.

**Recommended fix (not applied — flagging per this audit's own rules
about not making unrelated changes unilaterally):** make the live-apply
check whether the target database already has migrations recorded in
`supabase_migrations.schema_migrations` and skip (or only apply genuinely
pending files) when it does, and make a mid-loop failure surface as a loud
warning instead of a silently-swallowed "skipped" — right now a real syntax
error in a migration and "this database already has everything" look
identical from the console output.

**Verification note for this document:** every RLS claim and test result
elsewhere in this audit was produced immediately after a fresh
`supabase db reset`, specifically because this exact failure mode was
caught mid-session. The final `npm run verify` run reported in §6 was run
with `SUPABASE_DB_URL=""` to disable the broken live-apply path for that
one invocation, followed by one more `db reset` to leave the local database
in a correct, non-reverted state.

### F1 — MEDIUM: Tasks picker exposes full Customer/Employee PII to Marketing Admin and Sales Admin, beyond what the UI renders

**Evidence:** `docs/data-dictionary.md` already documents that `employees_select`/
`customers_select` RLS was deliberately widened (migration `0059`) to let
`sales_admin`/`marketing_admin` read `employees`/`customers` for the Team
Tasks employee/customer picker. That intent is real and documented. But the
actual query the Tasks page runs — `getEmployees()`/`getCustomers()` in
`src/lib/db/queries.ts` — does `select('*')`, and `src/app/(app)/tasks/page.tsx`
passes the full `EmployeeRow[]`/`CustomerRow[]` arrays as props straight into
the client component `tasks-board.tsx` (`'use client'`). The picker only
*renders* a name, but the browser receives every column: for `customers`
that includes `tax_id`, `payment_terms`, `address`, `phone`,
`default_currency`; for `employees` it includes `phone`. (Salary itself is
safe — it lives in the separate `employee_private` table, which neither role
can read.)

There is no corresponding `employees:view`/`sales:view` grant for either
role in `rbac.ts`, so this exposure is invisible in the file the project
treats as the authoritative permission source.

**Failure scenario:** A Marketing Admin opens `/tasks` to assign a task to a
salesperson. Their browser's RSC payload now contains every customer's tax
ID, address, and payment terms, and every employee's phone number — not
because they asked to see customer records, but as a side effect of a
dropdown.

**Recommended fix (not applied):** add narrow `getEmployeeOptions()`/
`getCustomerOptions()` helpers (`select id, name`) for picker use in Tasks,
and record the intentional, narrower grant in `rbac.ts` once the column
shape matches the documented intent. This is a business/product call on how
much customer/employee data these two roles should legitimately see —
flagging rather than changing it.

### F2 — MEDIUM: `system_admin` can write `quotations`/`quotation_items` via direct API, bypassing the app's permission gate and its audit trail

**Evidence:** Every mutation in `src/lib/actions/quotations.ts` is gated by
`assertPermission('sales:manage')`, and `system_admin` does not hold
`sales:manage` in `rbac.ts` (only `sales:view`). But the live RLS policies
`quotations_write`/`quotation_items_write` (`for all`, originally defined in
migration `0021`, unchanged through the `0053` performance pass) allow
`owner, system_admin, sales_admin`. Unlike the analogous, deliberately
documented exception on `stock_movements` (migration `0014`'s comment
explaining exactly why `sales_admin` needed adding), there is no comment
anywhere explaining why `system_admin` has write access here — it looks like
an unreviewed carry-over from the "system_admin manages this lookup table"
pattern used elsewhere (`inquiries`, `kpi_scorecards`, `price_records` — all
of which *do* grant `system_admin` the matching app permission).

**Failure scenario:** A `system_admin` account (or a compromised/scripted
session using it) calls the Supabase REST API directly and creates, edits,
or cancels a customer quotation. The app UI would never allow this
(`assertPermission('sales:manage')` throws), and because `writeAudit()` is
only called from inside the app's action functions, this write leaves **no
audit_log entry at all** — a silent, untracked change to a customer-facing
document.

**Recommended fix (not applied, needs a business decision):** either (a)
narrow `quotations_write`/`quotation_items_write` to `owner, sales_admin`
(matching `sales_orders`/`customers`), or (b) if `system_admin` is actually
meant to manage quotations, add `sales:manage` to `system_admin` in
`rbac.ts` and update the UI's gates accordingly. Flagging per the audit's
instructions rather than picking one.

### F3 — MEDIUM: `stock_movements` INSERT policy doesn't constrain movement `type`, only role

**Evidence:** `movements_insert`'s `with check` clause is
`auth_role() in ('owner','system_admin','warehouse_admin','sales_admin')` —
no restriction on the `type` column. The `sales_admin` grant is
intentional and documented (migration `0014`: "needed for
`post_sale_delivery`"), and that RPC *does* hardcode `type = 'sale_delivery'`
and a negative sign — but that safety lives entirely in the RPC's own SQL,
not in the RLS policy guarding the table it writes to. The only DB-level
constraint beyond role is `stock_movements_sign_chk`, which just checks sign
consistency per type (e.g. `adjustment` may be any non-zero amount, either
sign).

**Failure scenario:** A `sales_admin` (who in the app can only ever trigger
`post_sale_delivery`) calls `POST /rest/v1/stock_movements` directly with
`type: 'adjustment'` and an arbitrary quantity. RLS allows it (role matches),
the CHECK constraint allows it (adjustment accepts any non-zero amount), and
the derived `stock_balances` ledger (`SUM(quantity)` — this project's
"ledger, not totals" invariant) is now silently wrong, with no audit trail
and none of the app's order-matching/over-delivery validation applied.
`system_admin`'s inclusion predates this (original migration `0003`) and is
not explained by any comment either.

**Recommended fix (not applied, needs a business decision):** tighten the
`with check` to also require `type = 'sale_delivery'` specifically for the
`sales_admin` branch of this policy (the only flow that's actually sanctioned
for that role), and confirm whether `system_admin`'s long-standing blanket
insert access is still wanted.

### F4 — LOW: Six business-mutation RPC functions are still `EXECUTE`-granted to the unauthenticated `anon` role

**Evidence:** `create_draft_payroll_run`, `create_draft_purchase_order`,
`issue_quotation_document`, `post_purchase_receipt`, `post_sale_delivery`,
`post_stock_transfer` all still carry an `anon` grant in the live
`pg_proc`/ACL catalog. This is the exact defect migration
`0024_harden_audit_and_rpc_grants.sql` found and fixed once already (for
`product_family_usage`) — but that fix only revoked `anon` from the one
function the review happened to name, and changed
`alter default privileges` so **future** functions stop defaulting to
anon-executable. It never swept the functions that already existed at that
time (all six above predate `0024`), so they kept their original blanket
grant from `0011_grants.sql`.

**Empirically verified NOT currently exploitable:** all six are `security
invoker` (`pg_proc.prosecdef = false`, checked directly), and every table
they touch has RLS scoped `to authenticated` with no policy for `anon`.
Live test against the local DB (`set role anon`, rolled back) confirms
`anon` sees zero rows on `sales_order_items`, `quotations`, and `profiles`.
Tracing each function body: none perform any RLS-exempt side effect (e.g. a
bare `nextval()` on a real Postgres sequence) before hitting an
RLS-protected table — `issue_quotation_document`'s sequence-like table
(`quotation_doc_seq`) is itself RLS-protected, so even that path is blocked.
So today, calling any of these as `anon` just fails with an error; nothing
is read or written.

**Why it's still worth fixing:** this protection is accidental and fragile —
it depends on every one of these functions' underlying tables keeping their
RLS scoped exactly `to authenticated` forever. A single future policy change
that loosens any one of those tables for a broader audience would make the
matching RPC immediately pre-auth exploitable, silently, with no function
change needed.

**Recommended fix (not applied):**
`revoke execute on function <name> from anon;` for all six — purely additive
hardening, no legitimate caller uses the anon key for any of them.

### F5 — LOW: Seven tables have live RLS but zero application code, and are undocumented

**Evidence:** `commission_bands`, `commission_entries`,
`daily_marketing_reports`, `daily_sales_reports`, `marketing_settings`,
`construction_projects`, `competitor_prices` (migrations `0039`/`0040`/`0041`)
have real, enforced RLS policies but no reference anywhere under `src/`
(`grep` across `src/lib/actions` and `src/app` returns nothing), and no entry
in `docs/data-dictionary.md` — unlike other genuinely-dormant tables in this
codebase (`purchase_order_items`, `deposit_invoice_payments`), which *are*
explicitly marked dormant there. These look like schema scaffolded ahead of
a feature (commission tracking, a marketing/competitor-pricing module) that
was never built, and nothing in `rbac.ts` reflects them.

**Not an active vulnerability** — nothing in the app exercises these
tables — but it is undocumented, RBAC-invisible surface: right now, any
`payroll_admin` could read `commission_bands`/`commission_entries`, and any
`sales_admin`/`system_admin` could read **and write** the other five,
directly via the REST API, with no record of this anywhere a developer would
look.

**Recommended fix (not applied, product decision):** either document these
as dormant (matching the existing convention) or drop the dead schema+RLS in
a future migration.

### F6 — LOW / informational, not acted on

- `attendance` RLS grants `system_admin` insert/update, but `system_admin`
  has no `attendance:manage` in `rbac.ts` (only `attendance:view`). Given
  `system_admin` already holds the broadest administrative trust in the
  system (`users:manage`, `settings:manage`, `telegram:manage`,
  `invoice:manage`), this reads as an intentional "admin can always correct
  attendance" safety valve rather than an oversight — but it is undocumented
  in `rbac.ts`. Noted, not changed.
- `saveEmployeePrivate` (salary writes) is gated by
  `assertPermission('employee_sensitive:view')` — a permission named for
  *viewing* sensitive data, reused to authorize a *write*. The role sets
  happen to match exactly (`system_admin`, `payroll_admin` both at the app
  layer via this permission and at the RLS layer via `employee_private_all`),
  so this is **not a security gap**, just a confusing name worth a future
  cleanup (e.g. a dedicated `employee_sensitive:manage`).

## 4. Explicitly confirmed safe (no finding)

- **Every** `public` table has RLS enabled — verified directly
  (`pg_class.relrowsecurity`), zero exceptions.
- Storage buckets (`attachments`, `employee-photos`, `employee-docs`) are
  all private (`storage.buckets.public = false`) and their policies match
  the corresponding `rbac.ts` permissions exactly: `employee-photos`/
  `employee-docs` read = `employee_sensitive:view`'s role set; write =
  `employees:manage`'s role set (system_admin + owner only — `payroll_admin`
  can view but not overwrite a stored file/photo, which is stricter than the
  table-level grant and not a gap).
- `owner_exists()` and `set_my_locale()`'s `anon` grants are intentional and
  safe (pre-auth bootstrap check; self-scoped update that matches zero rows
  for an unauthenticated caller).
- `auth_role()`'s `anon` grant is safe — returns `NULL` for an unauthenticated
  caller, confirmed by migration `0024`'s own prior review.
- `tasks`/`daily_metrics` (Team Tasks), `payroll_runs`/`payroll_items`/
  `payroll_item_lines`, `sales_orders`/`sales_order_items`/`payment_receipts`/
  `deposit_invoices`, `purchase_orders`/`purchase_order_items`/`suppliers`,
  `overtime_entries`/`overtime_settings`, `kpi_scorecards`/`kpi_scorecard_lines`,
  `price_records`/`price_types`, `sales_targets`, `inquiry_*`, `skus`,
  `product_families`, `locations`, `attendance_groups`, `profiles`,
  `login_events`, `audit_log`, `telegram_settings`, `invoice_settings` — all
  cross-checked role-by-role, command-by-command, between `rbac.ts` and live
  RLS. All match exactly.
- `payroll:approve` / `stock:override_negative` — correctly Owner-only at
  both layers, by design (no role grant, sentinel-only).

## 5. Automated tests added

- `tests/unit/rbac.test.ts` — filled the pre-existing gap: zero tests
  referenced `marketing_admin` or `tasks:*` before this audit. Added
  coverage for `tasks:view`/`tasks:manage` across all 8 roles, confirmed
  Marketing Admin holds no permission beyond `EVERYONE` + tasks (the
  narrowest role), and a role-set integrity test that fails if a role is
  ever accidentally renamed or removed.
- `tests/integration/rls-policies.test.ts` (new) — real Postgres RLS
  enforcement tests, not mocks: each test opens a disposable,
  `begin/rollback`-wrapped transaction against a local Supabase Postgres,
  creates a throwaway `auth.users`/`profiles` row for a specific role (or
  uses the literal `anon` role), and asserts both the permitted AND denied
  outcome for that table/command — covering `employee_private`,
  `payroll_runs`, `customers` (F1), `stock_movements` insert (F3),
  `quotations` write (F2), `audit_log` forgery (the exact 0024 regression),
  "every public table has RLS," and anon's complete lack of access (F4).
  Guarded to refuse running against anything but `127.0.0.1`/`localhost`,
  and skips gracefully (not a failure) if no local Supabase is reachable —
  same posture as `scripts/validate-schema.mjs`'s own optional live check.

Results, run fresh after a `supabase db reset` (see F0 for why that
precondition matters): **47/47 new/updated tests pass** (30 RBAC unit +
17 RLS integration); full suite **531/531 pass**.

## 6. `npm run verify` result

```
▶ format    … ok
▶ lint      … ok
▶ typecheck … ok
▶ test      … ok
▶ schema    … ok
▶ build     … ok
▶ e2e       … ok
✅ verify passed in 64.4s
```

Run with `SUPABASE_DB_URL=""` to disable the broken live-apply path
described in F0 for this one invocation (format/lint/typecheck/test/build/
e2e are all unaffected by that variable — only `validate-schema.mjs`'s
optional live-apply reads it). Followed by one final `supabase db reset` so
the local database is left in a correct, non-reverted state.

## 7. What was explicitly NOT done

- No RLS policy, Postgres function, `rbac.ts` grant, or `scripts/` file was
  changed.
- No test was weakened or skipped to make it pass.
- The 7 findings above (F0–F6) are reported for review, not fixed —
  several require a business decision (F1, F2, F3, F5) or a deliberate
  tooling change (F0) this audit should not make unilaterally.
