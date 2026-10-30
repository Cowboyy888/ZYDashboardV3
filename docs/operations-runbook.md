# Operations Runbook

## Local setup

Prerequisites: **Node 20+**, **npm**, **Supabase CLI** (`brew install supabase/tap/supabase`
or see supabase.com/docs), Docker (for the local Supabase stack).

```bash
npm install
cp .env.example .env.local

supabase start          # boots local Postgres/Auth/Storage; prints keys + URLs
supabase db reset       # applies supabase/migrations/* then supabase/seed.sql
```

Copy the printed **anon key** and **service_role key** into `.env.local`
(`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`). The default
`NEXT_PUBLIC_SUPABASE_URL` (`http://127.0.0.1:54321`) and `SUPABASE_DB_URL`
already match the local stack.

```bash
npm run dev             # http://localhost:3000
```

## First-run admin bootstrap (safe)

Public self-signup is **disabled** (`enable_signup=false`). Accounts are created
only two ways:

1. Open <http://localhost:3000> → redirected to `/login` → **Set up the Owner
   account**. This bootstrap form is available **only while no Owner exists**
   (`owner_exists()` is false). It creates the first user via the service-role
   admin API; the DB trigger promotes them to **Owner**, and you're signed in.
2. After that, the setup page permanently shows **"Setup complete"** and refuses
   to create another account. The Owner / System Admin adds everyone else in
   **Settings → Users → Add user** (email, temporary password, role) — the only
   approved way to add users. New users then sign in and change their password.

> Env `BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD` document the intended
> first Owner; the account is created through the setup form.

## Running the full gate (with Playwright)

`npm run verify` runs the static gate plus a Playwright e2e step. The e2e step
runs automatically when a local Supabase is reachable:

```bash
supabase start                 # boots local Supabase
supabase db reset              # migrations + seed
npx playwright install chromium
set -a; source .env.local; set +a   # export Supabase URL + keys
npm run verify                 # includes attendance / transfer / report-preview e2e
```

If Supabase is not running, `verify` skips e2e with a message (set
`REQUIRE_E2E=1` to make a missing backend fail the gate). CI boots Supabase and
runs the full gate on every push (`.github/workflows/ci.yml`).

## Seeded data

`supabase/seed.sql` provides: locations (Storage Room, Warehouse); families
(钢筋网 / 螺纹盘圆 / 拔丝料); the supplied example 钢筋网 & 拔丝料 SKUs with
opening stock in Storage Room; and four example employees with Khmer/English/
Chinese names. Add remaining specifications in **Settings → Products**.

## Daily operations

- **Production planning:** Production → New production order. Warehouse Admin or
  Owner selects a confirmed sales line (or supplies an internal replenishment
  reason), sheet SKU and prepared wire mesh drawing. Enter quantity, due date,
  priority and optional supervisor/line reference. Save and review the persisted
  geometry/counts before Owner approval. Edit is draft-only. Hold/cancel require
  reasons; restoring an approved plan requires Owner. This never posts inventory.
  Drawings must first be prepared through the existing Sales drawing workflow.
  See `docs/PRODUCTION_ORDERS.md`.

- **Unavailable product requests** (inquiry managers): Sales → Inquiries →
  New/Edit → choose **Product unavailable**, enter diameter, panel size, mesh
  spacing and requested sheets, then save. Reopen the same inquiry for revisions.
  Use the existing stage/follow-up fields to track an open request; select a Lost
  stage only when the sale is actually lost. This does not snapshot inventory,
  compute shortages, or post stock. See `docs/INVENTORY_DEMAND.md`.

- **Attendance** (Attendance Admin): open **Attendance**, pick the shift, click
  **Mark all present**, then adjust exceptions (Late/Leave/Absent). The banner
  warns about anyone still **Unmarked**. Reports auto-send at 08:00/13:00; use
  **Send report** to send/resend manually.
- **Inventory** (Warehouse Admin): **Inventory → Record** to post opening balance,
  production output, stock-out, or an adjustment; **Transfer** to move stock
  between Storage Room and Warehouse (company total is unchanged). Balances update
  live. The daily inventory report auto-sends at the configured time.
- **Negative stock:** blocked with a clear message. Only an **Owner** can override,
  and only by entering a recorded reason on the movement.

## Deploying

For P4.1, review and apply the single additive
`20261030041812_production_orders.sql` migration only after confirming the target
baseline. Do not replay historical migrations. Verify new RLS/RPC grants and keep
`production_private` outside API-exposed schemas before releasing application code.
No production migration or deployment is performed by this implementation.

1. Create a Supabase project; push migrations: `supabase link` then
   `supabase db push` (and run the seed if desired).
2. Host the Next.js app (Node 20+). Set all env from `.env.example` with real
   values: Supabase URL + anon + service-role keys, `CRON_SECRET`, and (optional)
   Telegram token/chat id + `TELEGRAM_ADAPTER=http`.
3. Wire the three `/api/cron/*` endpoints to a scheduler (see
   `docs/telegram-runbook.md`).
4. Run `npm run verify` in CI on every change; run `PLAYWRIGHT=1 npm run verify`
   against a staging deployment for end-to-end coverage.

## Migration drift verification

Before releasing code that depends on database changes, run `npm run db:drift`
with `SUPABASE_DB_URL` supplied through the server-side environment. This command
does not load `.env.local` itself and never applies migrations. An unset URL or
missing `psql` skips the comparison; a skipped check is not deployment evidence.

The checker compares table/added-column/enum fingerprints. It recognizes
single-table `DROP TABLE public.<name>` statements with or without `IF EXISTS`,
and excludes retired tables and their columns from historical expectations.
Surviving ledger columns such as `stock_movements.batch_reference` and
`purchase_order_item_id` must still exist after Purchasing retirement.
This is a limited parser, not a SQL interpreter: policy/function changes,
drop-then-recreate histories, and unsupported SQL syntax require separate catalog
review. A clean result does not certify RLS, data backfills, or full migration
application; confirm those against the relevant migration and runbook.

## Backups & auditability

- The **ledger** and **audit log** are append-only (DB triggers); stock,
  attendance, and payroll records are **never hard-deleted** — corrections are new
  rows. This preserves a complete history for audit.
- Use Supabase's managed backups (or `pg_dump`) for disaster recovery.
- Review sensitive changes in **Settings → Audit Log** (Owner / System Admin).

## Troubleshooting

- **"Supabase is not configured"** on login → fill the `NEXT_PUBLIC_SUPABASE_*`
  values in `.env.local` and restart `npm run dev`.
- **Cron returns 401** → the `Authorization: Bearer $CRON_SECRET` header is missing
  or wrong.
- **Report not sent, status `no_chat`** → set a chat id in Settings → Telegram.
- **Movement rejected as negative** → insufficient stock; an Owner may override
  with a reason, otherwise correct the quantity.

## Removing Purchasing

Deploy the application change and apply migration
`20261029035331_remove_purchasing.sql` in a maintenance window: it takes exclusive
locks while snapshotting purchasing records and removing their tables. Take a
normal database backup first. The migration transaction rolls back in full if
any step fails. Do not edit or replay historical migrations against a live DB.
Verify that the five purchasing tables and both purchasing RPCs are absent,
that `/purchasing` and its API/export routes return 404 after deployment, and
that stock balances and stock-movement counts match the pre-migration values.
Historical source records are available to Owner/System Admin in audit_log
under `purchasing.retired`, keyed by original table and UUID. The shared private
attachments bucket is retained because Sales uses it too.

The migration was verified by replaying all prior migrations in isolated
PostgreSQL 17 with minimal Supabase auth/storage stubs, then the current seed,
`tests/sql/purchasing-removal-fixture.sql`, the retirement migration, and
`tests/sql/purchasing-removal.sql` in that order (`psql -v ON_ERROR_STOP=1`).
The SQL checks assert source snapshots, unchanged stock rows/balances, removed
tables/RPCs, blocked new receipts/links, allowed production entries, immutable
audit snapshots, retained family/SKU history guards, and snapshot RLS. These fixture scripts are only for
a disposable test database. Full browser tests still require local Supabase.
