# Zysteel Operations

Internal ops app (attendance, inventory, purchasing, sales, payroll, Telegram reporting) for a
steel mesh manufacturer. Next.js 15 App Router + TypeScript + Supabase. Live in production.

Product/domain docs: `docs/product-spec.md`, `docs/architecture.md`, `docs/data-dictionary.md`,
`docs/decisions.md`, `docs/operations-runbook.md`, `docs/telegram-runbook.md`,
`docs/test-plan.md`. Read those for *what the app does and why* — this file is for *how to work
in the repo*.

## Commands

`npm run verify` is the real gate (format → lint → typecheck → test → schema → build → e2e). Run
it before considering any change done. Individual steps (`npm run dev`, `build`, `test`, `lint`,
`format:write`, `typecheck`, `test:e2e`, `db:validate`) exist for iterating faster, not as a
substitute for `verify` before a handoff.

Deploy is manual and separate from this repo's automation: `vercel --prod --yes`, run by a human.
There is no deploy step in CI or in the multi-agent workflow below.

## Conventions

Sparse comments (WHY only, never WHAT). No speculative abstraction — match what's already there
before introducing a new pattern. RBAC via `src/lib/domain/rbac.ts` for every mutation. Balances
are always derived via `SUM` over an append-only ledger, never stored/incremented directly
("ledger, not totals" — see `docs/architecture.md`). Every user-facing string needs both `en` and
`zh` in `src/lib/i18n/index.ts`'s `dictionary`. Migrations in `supabase/migrations/` are additive
only — never edit an existing one.

## Multi-Agent Workflow

This repo runs a Claude Code multi-agent workflow backed by [Orbit](https://orbitkh.vercel.app)
task tracking (MCP-style HTTP API — see `.claude/docs/orbit-api-notes.md`). Current agent set:
**coder only** (scaffolded 2026-07-30; `code-reviewer` / `qa-agent` / `advisor` were scoped but
not chosen — see `.claude/docs/workflow.md`'s "Adding more agents later" for how to add them
without a rewrite).

- **Agent specs**: `.claude/agents/*.md` — one per agent, `coder.md` is mandatory and the only
  one permitted to edit source.
- **Shared rules** (security, escalation, communication, tags, state lifecycle, hard stops):
  `.claude/docs/workflow.md` — read this before touching the workflow, it's the source of truth,
  not any individual agent file.
- **Repo context for agents** (stack, commands, conventions, condensed so agents don't
  re-discover the repo every cycle): `.claude/docs/project-context.md`.
- **Orbit API reference** (tool catalog, call convention, project tag vocabulary):
  `.claude/docs/orbit-api-notes.md`.
- **Loop mechanics** (`/loop` + `ScheduleWakeup`, idle pacing): the `orbit-task-manager` skill,
  `.claude/skills/orbit-task-manager.md`.
- **Commands**: `/implement <task-id>` (single-pass, human-watched), `/sync-agent-task <task-id>`
  (read-only status check).
- **Permissions**: `.claude/settings.local.json` allows build/test/lint/git-local/the Orbit
  endpoint; push, deploy, and destructive git are explicitly denied — always a human action.

`ORBIT_API_KEY` lives in `.env` (gitignored, never committed, never printed).
