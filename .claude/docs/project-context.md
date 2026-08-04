# Project context (for agents — read this instead of re-discovering the repo)

Zysteel Operations (`zysteel-operations` in `package.json`) — an internal ops app (attendance,
inventory, purchasing, sales, payroll, Telegram reporting) for a steel mesh manufacturer. Live in
production. Full domain spec: `docs/product-spec.md`, `docs/architecture.md`,
`docs/data-dictionary.md`. Read those before `docs/decisions.md` for the "why," not this file —
this file is scaffolding-scoped, not a product spec.

## Stack

- Next.js 15.5 (App Router), React 19, TypeScript 5.7 strict, Tailwind CSS 3.4
- Supabase (Postgres + RLS + Auth + Storage) — no ORM, hand-written SQL migrations in
  `supabase/migrations/` (currently `0001`…`0017`, sequential, **additive only** — never edit an
  old migration file, add a new one)
- npm (`package-lock.json`); Node `>=20`

## Commands (from `package.json` — these are real, run them, don't guess)

| Purpose | Command |
|---|---|
| Dev server | `npm run dev` |
| Build | `npm run build` |
| Typecheck | `npm run typecheck` |
| Lint | `npm run lint` |
| Format check / write | `npm run format` / `npm run format:write` |
| Unit + integration tests | `npm run test` (Vitest) |
| E2E tests | `npm run test:e2e` (Playwright; needs local Supabase running) |
| Schema sanity check | `npm run db:validate` |
| **Everything above, in order** | **`npm run verify`** — this is the actual gate. Run it before any handoff. It auto-skips the e2e step if local Supabase isn't reachable. |

Deploy is **manual, never automated**: `vercel --prod --yes` from the local CLI. There is no
deploy job in CI (`.github/workflows/ci.yml` only runs `verify` and a full e2e job). No agent in
this workflow deploys — see hard stops in `workflow.md`.

## Source layout

- `src/app/` — Next.js App Router routes. `(app)/` = authenticated shell, `(auth)/` = login/setup.
- `src/components/` — shared UI (`ui/` = shadcn-style primitives, `forms/` = Server Action form
  helpers, domain-named folders like `telegram/`, `attendance/`, `brand/`).
- `src/lib/domain/` — pure business logic (no I/O), e.g. `rbac.ts`, `payroll.ts`,
  `stock-ledger.ts`. Unit-tested in `tests/unit/`.
- `src/lib/actions/` — Server Actions (mutations). Pattern: `assertPermission(...)` →
  `zod` validate → mutate → `writeAudit(...)` → return `ok(...)`/`fail(...)` from `./types`.
- `src/lib/db/queries.ts` — all read queries in one file, each wrapped in try/catch returning
  `[]`/`null` on error (never throws into a page render).
- `src/lib/i18n/` — `dictionary` (UI labels, `{en, zh}`) + `PHRASES` (server-action message
  translation map). Every dictionary key needs both languages or `tests/unit/i18n.test.ts` fails.
- `tests/unit/`, `tests/integration/` — Vitest. `tests/e2e/` — Playwright specs.

## Conventions agents must match

- **Comments**: sparse. Only WHY (a hidden constraint, a subtle invariant, a workaround) — never
  WHAT (the code already says that). No file-header boilerplate, no docstring paragraphs.
- **No speculative abstraction**: don't generalize past what the current task needs. Three
  similar lines beat a premature helper.
- **RBAC**: every mutation checks a permission from `src/lib/domain/rbac.ts` — mirror the
  existing `Permission` union, don't invent a parallel check.
- **"Ledger, not totals"**: balances/totals are always derived via `SUM` over an append-only
  ledger table, never stored and incremented directly. If a task looks like it wants a stored
  running total, re-read `docs/architecture.md` first — it's almost certainly wrong.
- **Audit**: sensitive mutations call `writeAudit(...)` — never log salary/wage values directly.
- **i18n**: any new user-facing string needs a `dictionary` entry with both `en` and `zh` — no
  hardcoded UI text, no partial translation.
- **Formatting**: Prettier is authoritative (single quotes, trailing commas, 100 cols,
  `prettier-plugin-tailwindcss` for class ordering) — run `npm run format:write`, don't hand-format.
- **Commits**: plain descriptive subject lines (no conventional-commit prefixes) — match
  `git log` style already in the repo.

## What NOT to do

- Don't touch `vercel.json`'s `regions` (pinned to `sin1` — Supabase is co-located in
  `ap-southeast-1`; changing one without the other reintroduces cross-region latency).
- Don't edit an existing file in `supabase/migrations/` — add a new numbered one.
- Don't add a new pay type, employee-number-style field, or anything else `docs/decisions.md`
  records as deliberately removed, unless the task explicitly asks to reintroduce it.
- Don't push, deploy, or force anything — see hard stops in `workflow.md`.
