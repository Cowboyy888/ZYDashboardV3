# Architecture — Zysteel Operations

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
