# AGENTS.md — engineering contract for Zysteel Operations

This file governs **every** change to this repository, whether made by a human or
an AI agent. Read it before you touch code.

Zysteel (中粤铁网) runs daily operations on this system: attendance, an
append-only stock ledger, and Telegram reporting. Correctness and auditability
are more important than speed. When in doubt, prefer the safe, traceable option.

## Mandatory workflow for any coding task

1. **Read the relevant docs first.** Before editing, read the docs that cover the
   area you are changing: `docs/product-spec.md`, `docs/architecture.md`,
   `docs/data-dictionary.md`, and the relevant runbook. Do not guess at business
   rules — they are written down.
2. **State the acceptance criteria.** Begin the task by writing down, explicitly,
   what "done" means and how it will be verified. Tie it back to the numbered
   acceptance criteria in `docs/test-plan.md` where applicable.
3. **Add or adjust tests for changed behavior.** Any behavior change requires a
   matching test change in `tests/unit`, `tests/integration`, or `tests/e2e`.
   New domain logic goes in `src/lib/domain/**` (pure, unit-tested) wherever
   possible.
4. **Run the checks.** Run `npm run verify` (format, lint, type-check, unit &
   integration tests, schema validation, build) and, when the app is configured,
   the relevant Playwright flows (`PLAYWRIGHT=1 npm run verify`). Do not mark a
   task complete while any check is red.
5. **Update the docs / data dictionary when schema or workflow changes.** Any
   migration, new table/column, new movement type, RLS change, or workflow change
   must be reflected in `docs/data-dictionary.md` and, if relevant,
   `docs/architecture.md` and `docs/decisions.md` in the **same** change.
6. **Never expose secrets.** The Telegram bot token, Supabase service-role key,
   and any credential live only in server-side env vars. Never send them to the
   browser, log them, or write them into the audit log. **Salaries and private
   employee photos/documents are restricted to Owner, System Admin, and Payroll
   Admin** — never widen that access, never log salary values (log
   `{ updated: true }` instead), and always serve photos via short-lived signed
   URLs from private buckets.
7. **Preserve auditability — never hard-delete.** Stock movement, payroll, and
   attendance records must never be hard-deleted. The ledger and audit log are
   append-only (enforced by DB triggers). Corrections are new movements /
   adjustments / revisions, not edits or deletes. Sensitive changes must write an
   `audit_log` entry (actor, action, entity, old value, new value).
8. **Keep quantities and payroll traceable to source records.** Stock is always
   `SUM(stock_movements.quantity)` — never a stored editable total. Payroll
   results must be reproducible from approved attendance + the configured rules.
   Do not introduce denormalized totals that can drift from their source.

## Non-negotiable invariants

- **Stock is a ledger.** No manual stock totals. Balance = `Σ quantity`. Transfers
  are matching `transfer_out` / `transfer_in` pairs and never change the company
  total. Negative stock is blocked unless an **Owner** overrides with a recorded
  reason (enforced in the DB trigger `enforce_stock_rules` and mirrored in
  `src/lib/domain/stock-ledger.ts`).
- **Timezone.** All schedules and displayed times use **Asia/Bangkok**. The DB
  stores UTC instants (`timestamptz`) but every operational row also carries a
  local `business_date`. Dates render as **dd/mm/yyyy**.
- **RBAC is defined once** in `src/lib/domain/rbac.ts` and mirrored by Postgres
  RLS in `supabase/migrations/0003_rls.sql`. Change both together.
- **i18n.** UI is bilingual (中文 default / English). Product terms (钢筋网, 张,
  捆…) render verbatim in both languages. Khmer names use the Khmer font stack.

## Where things live

- Pure business logic + tests: `src/lib/domain/**`, `tests/unit`, `tests/integration`
- Data access (RLS-respecting): `src/lib/db/queries.ts`
- Server mutations: `src/lib/actions/**` (validate with Zod → mutate → `writeAudit` → `revalidatePath`)
- Adapters: `src/lib/supabase/**`, `src/lib/telegram/**`
- DB: `supabase/migrations/**`, `supabase/seed.sql`
- Scheduled jobs: `src/app/api/cron/[job]/route.ts` (secret-guarded, idempotent)

If you cannot satisfy this contract, stop and flag it rather than working around
it.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
