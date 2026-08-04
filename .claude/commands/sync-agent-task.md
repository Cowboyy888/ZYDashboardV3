---
description: Read-only status check — reconcile local repo state against one ORBIT task
argument-hint: <task-id>
---

A diagnostic, **read-only** sync check for one task — useful before resuming work after a context
reset, or when a human asks "what's actually going on with task X." Makes no ORBIT mutations and
no source edits.

Task id: `$ARGUMENTS`

Steps:
1. If no task id was given, stop and ask for one.
2. `tasks.get { task_id: "$ARGUMENTS" }` (call convention in `.claude/docs/orbit-api-notes.md`) —
   report its current `status`, tags, checklist progress, blocker state, and sub-task roll-up.
3. `tasks.comments { task_id: "$ARGUMENTS" }` — summarize the handoff history in order (who did
   what, per the append-only comment log — this is where agents actually talk to each other, see
   `.claude/docs/workflow.md`).
4. Cross-check against the local repo: `git log --oneline --grep` for anything referencing this
   task id, and `git status` for uncommitted work that might belong to it.
5. Summarize: is ORBIT's view of this task consistent with what's actually in the repo? Flag any
   mismatch (e.g. task says `done` but no matching commit exists, or there's uncommitted work
   with no comment explaining it) — don't fix it, just report it. Fixing state mismatches is a
   judgment call for whichever agent or human picks this up next, not something this command
   does unattended.
