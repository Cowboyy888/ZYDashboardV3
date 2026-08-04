---
description: Implement one specific ORBIT task by id (single pass, not the autonomous loop)
argument-hint: <task-id>
---

Run the `coder` agent's per-task procedure (`.claude/agents/coder.md`) for a single task, given
directly rather than claimed via `tasks.next`.

Task id: `$ARGUMENTS`

Steps:
1. If no task id was given, stop and ask for one — don't guess or pick "the next one" (that's
   what the autonomous loop is for, not this command).
2. `tasks.get { task_id: "$ARGUMENTS" }` via the call convention in
   `.claude/docs/orbit-api-notes.md`. If it 404s, say so and stop — don't silently no-op.
3. Check its `blocked_by` — if anything listed is incomplete, tell the human this task is gated
   and stop rather than forcing past the dependency.
4. Follow `.claude/agents/coder.md`'s per-task procedure exactly, starting from step 2
   (`tasks.status → in_progress`) through handoff. This is a single pass: implement, verify with
   `npm run verify`, commit locally (never push), comment the handoff, set the terminal status.
5. Report back in the chat what was done and the verify result — this command is meant to be run
   by a human watching, unlike the autonomous `/loop` path, so summarize instead of just relying
   on the ORBIT comment.
