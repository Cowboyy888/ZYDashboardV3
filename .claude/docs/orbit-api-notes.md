# ORBIT API notes

Recorded from a live `tasks.describe` call against the endpoint below (not copied from
external docs). Re-run `tasks.describe` and refresh this file if the API changes shape.

## Connection

- Endpoint: `https://orbitkh.vercel.app/api/mcp`
- Auth header: `X-Project-Api-Key: <value of ORBIT_API_KEY>`
- Key location: `.env` at repo root (gitignored — confirmed via `git check-ignore -v .env`), key `ORBIT_API_KEY`
- Call shape (verified working via `curl`):
  ```bash
  set -a; source .env; set +a
  curl -sS -X POST "https://orbitkh.vercel.app/api/mcp" \
    -H "Content-Type: application/json" \
    -H "X-Project-Api-Key: $ORBIT_API_KEY" \
    -d '{"tool":"tasks.list","input":{"limit":1}}'
  ```
  Response envelope: `{"ok": true, "result": {...}}` (200) or an error body on failure.

**Important, unverified assumption:** the endpoint is documented as an "MCP endpoint," but the
actual wire protocol confirmed here is a plain `POST {tool, input}` JSON body — not standard
MCP JSON-RPC (`tools/call` etc). This repo does **not** register it in `.mcp.json` as a native
Claude Code MCP server, because that would assume JSON-RPC framing I haven't verified. Agents
call it via `Bash` + `curl` instead, which is proven to work. If you want native MCP tool
discovery instead of curl, confirm with Orbit whether the endpoint also speaks JSON-RPC before
wiring `claude mcp add`.

**Never print `$ORBIT_API_KEY`** in output, logs, or comments — treat it exactly like any other
secret in this repo.

## Statuses

`backlog` · `todo` · `in_progress` · `in_review` · `blocked` · `done`

## Tools (27 total, from `tasks.describe`)

### Core loop
- **`tasks.next { agent_tag, exclude_tags?, claim? }`** — the primary loop call. Returns
  incomplete tasks tagged `agent_tag`, FIFO by `created_at`, wrapped as a ready-to-execute
  prompt. Tasks that are `status=blocked` or have incomplete `blocked_by` deps are **skipped
  server-side**. Returns `{ idle: true }` when nothing's ready. Task content is delimited as
  untrusted data by the server.
- **`tasks.get { task_id }`** — one task with blocker details, sub-task roll-up, comment count,
  recent activity.
- **`tasks.list { limit?, offset?, status?, tags?, match?, exclude_tags?, updated_since?,
  parent_id?, date/date_from/date_to?, completed? }`** — general query/report tool.

### Mutating a task
- **`tasks.status { task_id, status, force? }`** — set workflow status. `done` also marks
  completed; guarded by open blockers/sub-tasks (`409 completion_blocked`) unless `force:true`.
  **Never pass `force` without an explicit human decision** — that's exactly the guard this repo
  relies on to stop an agent from closing something prematurely.
- **`tasks.complete { task_id, completed, force? }`** — same completion guard as above.
- **`tasks.update { task_id, ... }`** — general field update. **`tags` here REPLACES the whole
  array** — never use it for tags. Use `tasks.tags.add`/`tasks.tags.remove` instead (see below).
- **`tasks.checklist { task_id, index, done }`** — check/uncheck ONE acceptance-criteria item by
  zero-based index, atomically. This is how the coder marks criteria met one at a time.
- **`tasks.move { task_id, start_date?, end_date?, ... }`** — reschedule dates.
- **`tasks.delete { task_id }`** — audit row survives.

### Tags (always atomic — never full-array replace)
- **`tasks.tags.add { task_id | task_ids, tags }`**
- **`tasks.tags.remove { task_id | task_ids, tags }`**

### Dependencies (native phase-gating)
- **`tasks.deps.add { task_id, blocked_by }`** — `task_id` becomes blocked by the given ids.
  While any blocker is incomplete, `tasks.next` skips the task and completion is rejected.
- **`tasks.deps.remove { task_id, blocked_by }`**

### Communication (append-only — never edit `description` to talk to another agent)
- **`tasks.comment { task_id, body, author? }`**
- **`tasks.comments { task_id, limit? }`**
- **`tasks.activity { task_id?, since?, limit? }`** — audit trail (actor, action, field diff);
  survives deletion. Use `since` for "what changed" reports.

### Bulk / creation
- **`tasks.create { title, description?, status?, blocked_by?, parent_id?, checklist?,
  dedupe_key?, assigned_to?, tags?, metadata? }`** — `dedupe_key` makes creation idempotent
  (re-running with the same key returns the existing task, `deduped:true`, instead of a
  duplicate). Use this for every `wf:bug` / `wf:needs-human` task this repo's agents file.
- **`tasks.bulk { task_ids, set?, add_tags?, remove_tags?, force? }`** — same patch to up to 100
  tasks at once.

### Cosmetic (nice to have, not required for the loop)
- **`tags.config.list/set/delete`** — colored badge config per tag pattern, shown to humans in
  the Orbit UI. `tags.config.set` is idempotent (upsert by pattern) — safe to call once on
  agent startup so e.g. `assign:coder` renders as a highlighted badge.
- **`notes.list/get/create/update/delete`** — goal-level markdown notes, separate from tasks.
  Not part of the task loop; not used by the agents scaffolded here.

## Project-scoping convention used in this repo

- `project:zysteel-operations` — tag every task this workflow creates or touches (from
  `package.json` `name`).
- `assign:coder` — the coder agent's `agent_tag` for `tasks.next`.
- `wf:approved`, `wf:change-request`, `wf:bug`, `wf:needs-human` — workflow-state tags used by
  the (currently unscaffolded) reviewer/qa/escalation paths. Kept here so adding those agents
  later doesn't require renaming anything already in flight.
