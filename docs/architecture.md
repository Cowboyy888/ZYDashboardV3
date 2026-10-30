# Architecture — Zysteel Operations

## Production planning (P4.1)

Production plans are separate from stock movements: approving a plan never posts
inventory. Existing SKU/drawing/employee/source-order identities are reused;
geometry is snapshotted and calculated with the existing wire-mesh domain helper.
Versioned draft/status actions use RLS, database actor/approval guards and an
atomic audit trigger. Privileged source lookup/trigger helpers are isolated in
non-exposed `production_private`; public invoker RPCs expose only bounded planning
references. See [Production Orders](PRODUCTION_ORDERS.md) for lifecycle, migration,
privacy boundaries and verification. P4.2–P4.8 remain separate increments.

## Layers

```
┌─────────────────────────────────────────────────────────────┐
│ UI (App Router)                                              │
│  src/app/**  ·  server components fetch via src/lib/db       │
│  client components submit to server actions                  │
├─────────────────────────────────────────────────────────────┤
│ Server actions (src/lib/actions/**)                          │
│  Zod validate → authorize → mutate (Supabase) → audit →      │
│  revalidatePath                                              │
├─────────────────────────────────────────────────────────────┤
│ Domain (src/lib/domain/**)  ← PURE, unit-tested, no I/O      │
│  stock-ledger · attendance · rbac · products · datetime ·    │
│  inventory-view · reports                                    │
├─────────────────────────────────────────────────────────────┤
│ Adapters                                                     │
│  supabase (server/browser/admin + middleware)                │
│  telegram (interface + mock/http + idempotency store)        │
├─────────────────────────────────────────────────────────────┤
│ PostgreSQL (Supabase)                                        │
│  tables · views · triggers (invariants) · RLS · storage      │
└─────────────────────────────────────────────────────────────┘
```

The **domain layer is the source of truth for business rules** and is fully
unit-tested without any database or network. The database independently
**enforces** the critical invariants via triggers and RLS, so correctness does
not depend on the app being bug-free.

## Key decisions

- **Stock is a ledger, never a stored total.** `stock_movements.quantity` is a
  signed number and the balance is `SUM(quantity)` (view `stock_balances`). This
  makes every balance traceable to source rows and makes transfers naturally
  total-preserving. Sign convention lives in `src/lib/domain/stock-ledger.ts` and
  is enforced by a DB `CHECK` constraint.
- **Invariants in the database.** A `BEFORE INSERT` trigger blocks any movement
  that would drive a location balance negative unless the actor is an **Owner**
  and supplies an override reason. `BEFORE UPDATE/DELETE` triggers make the ledger
  and audit log append-only and prevent hard-deleting attendance. These hold even
  against direct SQL.
- **Column-level salary protection via a separate table.** Postgres RLS is
  row-level, so sensitive pay fields live in `employee_private` with its own
  strict policy (Owner / System Admin / Payroll Admin only). Photos/documents live
  in **private** Storage buckets served through short-lived signed URLs.
- **RBAC defined once, mirrored in RLS.** `src/lib/domain/rbac.ts` is the single
  policy table used by the app; `supabase/migrations/0003_rls.sql` mirrors it in
  the database. Both must change together.
- **Timezone strategy.** Instants are stored UTC (`timestamptz`); every
  operational row also stores a local `business_date` (a plain `date`) so "which
  day" is unambiguous across the UTC boundary. All display + scheduling use
  Asia/Bangkok; helpers in `src/lib/domain/datetime.ts` derive the offset from
  the IANA zone (correct even if DST rules change).
- **Adapters behind interfaces.** `TelegramClient` has `MockTelegramClient`
  (default, no network) and `HttpTelegramClient` (real Bot API), chosen by env.
  Supabase has request-scoped (RLS) and service-role (jobs) clients. This lets the
  whole app run and be tested locally with no credentials.
- **Wire mesh geometry is derived.** Drawings persist source dimensions,
  spacing, overhangs, and quantity only. The pure domain calculation rejects
  non-exact fits and derives counts/areas for both the live SVG and PDF.
- **Idempotent scheduled reports.** `sendReportOnce` + a `sent_reports` table with
  a unique `report_key` guarantee a scheduled report is sent at most once, even if
  a cron provider retries. Manual "Send now" bypasses the guard (to resend a
  correction) but is still logged.

## Request/data flow examples

**Post a stock movement.** Client form → `postMovement` server action → Zod parse
→ `assertPermission` → defence-in-depth negative-guard check
(`evaluateNegativeGuard`) → insert into `stock_movements` (DB trigger is the
ultimate guard) → `writeAudit` → `revalidatePath`. The inventory page re-reads
`stock_balances`.

**Scheduled attendance report.** Cron provider hits
`/api/cron/attendance-morning` with `Authorization: Bearer $CRON_SECRET` →
`runScheduledReport('attendance_morning')` → builds text from
`summarizeShift` + `renderAttendanceReport` → `sendReportOnce` (keyed
`attendance_morning:YYYY-MM-DD`) via the configured Telegram client → records the
outcome in `sent_reports`.

## Auth & routing

- Supabase Auth (email/password). Middleware (`src/middleware.ts`) refreshes the
  session and redirects unauthenticated users to `/login`; it no-ops safely when
  Supabase is not configured.
- The first account created becomes the **Owner** (DB trigger
  `handle_new_user`); subsequent signups start as **Viewer** and are promoted in
  Settings → Users.
- `(app)` routes require an authenticated, active user; each page also calls
  `requirePermission(...)`.

## Environments

- **Local:** Supabase CLI stack (`supabase start` / `db reset`) + mock Telegram.
- **Deployed:** any Node host for Next.js + a Supabase project; set env per
  `.env.example`; wire the three `/api/cron/*` endpoints to a scheduler and
  provide a real Telegram token. See the runbooks.

## Purchasing retirement (29/10/2026)

Purchasing routes, navigation, actions, queries, and reports are removed. Shared
currency rules live in `src/lib/domain/currency.ts`; Sales attachments use
`src/components/attachment-field.tsx`. The retirement migration snapshots source
rows to the restricted append-only audit log before dropping operational tables
and RPCs. Historical stock rows remain intact and traceable by their original
purchase-item UUID; a trigger blocks new purchase receipts. Existing SKU and
family-history guards resolve historical lines through those snapshots.

## Inventory Demand source capture (30/10/2026)

Inventory Demand's first source-capture increment reuses `sales_inquiries` and
`inquiry_loss_reasons` rather than introducing another product/customer/demand
master. Authenticated inquiry actions resolve the stable `stock_unavailable`
code, validate request fields using the pure inquiry-loss domain helper, and
update the same inquiry on revision. No stock-at-request snapshot or aggregate
demand table is introduced. See [scope and dependencies](INVENTORY_DEMAND.md).

## Dashboard query performance (29/10/2026)

P9's first fix gates dashboard attendance reads/cards/exceptions on
`attendance:view` and stock/production-receipt reads/cards on `inventory:view`.
Viewer retains both; production entry additionally requires `stock:production`.
These are request-time application checks alongside unchanged source RLS, with
no persistent cache. See [P9 audit and request measurements](PHASE9_TECHNICAL_AUDIT.md).

The [P5.1 KPI contract](DASHBOARD_KPI_DEFINITIONS.md) records current dashboard
formulas and proposed analytics boundaries. Confirmed order value, paid-date
markers, historical receipt amounts and contractual invoice amounts are distinct
measures. Production orders currently represent plans, not execution. Future
aggregates must authorize each source domain, preserve currencies/units and report
incomplete coverage or failed reads instead of presenting them as zero activity.
P5.1 changes documentation only; no new query, cache or aggregate is implemented.

The dashboard computes its month-to-date attendance rate from two parallel,
RLS-respecting exact HEAD counts (present + late / all non-leave records),
instead of downloading a month of rows. This avoids PostgREST’s 1,000-row cap
and removes attendance-row payloads from this KPI. The formula is shared with
the pure attendance domain helper.

`getCurrentUser` uses React’s request-scoped `cache` so Server Components in
the same render share verified auth/profile lookups. There is no persistent
or cross-request auth cache; active-user checks and RBAC remain in place.
Retries wait once between attempts, with no delay after a final failure.

Price-record expiry windows use Bangkok business dates; the monthly timestamp
cutoff is local midnight converted to UTC. Only the Special Price counter waits
for its type lookup; five independent HEAD counts start in parallel with it.
