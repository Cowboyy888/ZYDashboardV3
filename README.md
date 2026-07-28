# Zysteel Operations · 中粤铁网 运营系统

Production-oriented operations app for Zysteel (中粤铁网): **employee attendance**,
an **append-only stock ledger**, and **Telegram reporting** — bilingual
(**English default / 中文**, switchable in-app via an `EN | 中文` control),
Khmer-name aware, `dd/mm/yyyy` dates, all schedules in **Asia/Phnom_Penh**.

> **Status: First pass (Operations MVP).** Purchasing, Sales, Payroll, and full
> Reports are scoped for later passes and appear as navigation placeholders. See
> `docs/product-spec.md` and `docs/decisions.md`.

## Stack

- **Next.js 15** (App Router) · **TypeScript** · **Tailwind CSS** · **shadcn/ui**
- **Supabase**: PostgreSQL · Auth · Storage · Row Level Security
- **Zod** validation · **Vitest** (unit/integration) · **Playwright** (e2e)
- **Telegram Bot API** behind a mockable adapter

## Architecture at a glance

- **Domain-first.** All business rules (stock ledger, attendance aggregation,
  RBAC, timezone/date, report text) live as pure, unit-tested modules in
  `src/lib/domain/**` — no I/O, no framework.
- **Ledger, not totals.** Stock is always `SUM(stock_movements.quantity)`.
- **Enforced invariants in the DB.** Non-negative stock (Owner override only),
  append-only ledger + audit log, no hard-deletes — all enforced by Postgres
  triggers and RLS, so they hold regardless of the calling code.
- **Adapters behind interfaces.** Telegram + Supabase are swappable; with no
  credentials the app uses a mock Telegram adapter and never makes network calls.

See `docs/architecture.md` for the full picture.

## Quick start (local)

Prerequisites: **Node 20+**, **npm**, and the **Supabase CLI** (`supabase`).

```bash
# 1. Install deps
npm install

# 2. Configure env
cp .env.example .env.local
# (defaults target the local Supabase stack; no real secrets needed)

# 3. Start Supabase locally, then apply migrations + seed
supabase start
supabase db reset          # applies supabase/migrations/* then supabase/seed.sql
# copy the printed anon + service_role keys into .env.local

# 4. Run the app
npm run dev                # http://localhost:3000
```

Then open <http://localhost:3000>, click **Set up the Owner account** — the first
account created becomes the **Owner**. Full setup details are in
`docs/operations-runbook.md`.

### Telegram (optional)

Leave `TELEGRAM_BOT_TOKEN` blank to use the built-in **mock** adapter (no messages
are sent; everything is still testable). To send real messages, follow
`docs/telegram-runbook.md`.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` / `npm run start` | Production build / serve |
| `npm run lint` | ESLint (next lint) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run test` | Vitest unit + integration tests |
| `npm run test:e2e` | Playwright critical flows (needs a running app) |
| `npm run db:validate` | Static schema validation (optionally applies to `SUPABASE_DB_URL`) |
| **`npm run verify`** | **The full gate:** format · lint · typecheck · tests · schema · build (+ e2e when `PLAYWRIGHT=1`) |

## Project layout

```
src/
  app/                     # App Router (auth group, (app) group, api/cron)
  components/              # UI primitives (shadcn) + app shell + feature widgets
  lib/
    domain/                # PURE business logic (unit-tested)
    db/                    # row types + RLS-respecting queries
    actions/               # server actions (Zod-validated mutations + audit)
    supabase/              # server/browser/admin clients + middleware
    telegram/              # client interface + mock/http adapters + idempotency
    reports/               # server report service (build + send)
supabase/
  migrations/              # schema, functions/triggers, RLS, storage
  seed.sql                 # locations, families, example SKUs + opening stock
tests/                     # unit / integration / e2e
docs/                      # product, architecture, data dictionary, runbooks
scripts/                   # verify.mjs, validate-schema.mjs
```

## Documentation

- `AGENTS.md` — engineering contract (read before changing code)
- `docs/product-spec.md` — scope & roadmap
- `docs/architecture.md` — how it fits together
- `docs/data-dictionary.md` — tables, columns, movement types, RLS matrix
- `docs/test-plan.md` — acceptance criteria → tests
- `docs/telegram-runbook.md` — bot setup, scheduling, idempotency
- `docs/operations-runbook.md` — install, admin bootstrap, daily ops
- `docs/decisions.md` — decision log + completion status
