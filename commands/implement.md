---
description: "Phase 4 — build the reviewed plan step by step with the simplest code, conducting ponytail//simplify//frontend-design, then advise review."
argument-hint: "[request-id]"
---

# /vibe-flow:implement

Phase 4 of vibe-flow. Turn the reviewed plan into the simplest working code, one step at a time, staying inside each step's declared file scope. Edits run here on the MAIN THREAD.

## 0. Locate the request and plan

Resolve the request id from `$ARGUMENTS` if given, else ask the helper:

```
node "${CLAUDE_PLUGIN_ROOT}/bin/vibe.mjs" status --project-dir "${CLAUDE_PROJECT_DIR}" --json
```

Read `${CLAUDE_PROJECT_DIR}/plans/<id>.md`. If the plan `status` is not `reviewed`, say so and suggest `/vibe-flow:plan` (review it) first — proceed only if the user insists. If there is no plan, stop and suggest `/vibe-flow:plan`.

## 1. Checkpoint before touching code

Take a recoverable checkpoint so the work is reversible: prefer `git add -A && git commit -m "vibe-flow: pre-implement <id>"` (or a branch/stash) if this is a git repo. If git is unavailable, note that no checkpoint was taken. Do not block on this.

## 2. Read the plan steps

The plan frontmatter has `steps: [ {id, intent, files, satisfies, tests, status} ]`. Work the steps in order, skipping any already `status: done`. For each step you stay strictly within its `files` scope — if a step genuinely needs a file it does not list, note the out-of-scope edit explicitly rather than doing it silently.

When you begin, set the plan's top-level frontmatter `status: implementing` (leave it there until review). This is what advances the advisory status from "implement" toward "review" once every step is `done` — the status mapping treats a `reviewed` plan as "not yet started", so it must move to `implementing` for the workflow to progress.

## 3. For each step — simplest code that satisfies it

1. Implement the step's `intent` with the laziest solution that actually works (ponytail spirit): reach for the standard library and existing project code before new abstractions or dependencies; one line before fifty.
2. Conduct supporting tools by instruction, with graceful degradation:
   - **ponytail**: If the ponytail plugin/skill is available, apply it to keep this step minimal (full intensity by default — auto runs pass the run effort instead); otherwise skip and note it was skipped — keep the ponytail mindset inline.
   - **/simplify**: If `/simplify` is available, run it on the files touched in this step to apply quality cleanups; otherwise skip and note it was skipped.
   - **/frontend-design**: If this step touches UI/styling files (e.g. components, templates, CSS/Tailwind, design tokens) and `/frontend-design` is available, invoke it for that work; otherwise skip and note it was skipped.
3. Leave a runnable check for any non-trivial logic: a test (matching the step's `tests`), an example invocation, or a command the reviewer can run. Trivial steps need none.
4. Mark the step done by setting its `status: done` in `${CLAUDE_PROJECT_DIR}/plans/<id>.md` frontmatter. The PostToolUse hook will resync indexes.

## 4. Wrap up

- Cover every step. If a step is genuinely blocked (irreversible class — destructive migration, secret/credential change, money/external side-effect, deletion, force-push, prod deploy, security boundary), stop on that step, record what is pending, and surface it rather than forcing it through.
- Report: each step's status, what ponytail//simplify//frontend-design contributed or was skipped, any out-of-scope edits, and the runnable check(s) to verify the work.

Advisory next step: **/vibe-flow:review**.
