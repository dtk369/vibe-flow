---
description: Phase 3 — write a file-by-file implementation plan (steps→files→tests) and adversarially review it before building.
argument-hint: "[request-id]"
---

# /vibe-flow:plan

Phase 3 of vibe-flow. Turn the clarified understanding and the accepted
decisions into an ordered, file-by-file plan whose steps each carry their own
tests — then have it adversarially reviewed before you build.

## 0. Locate the request

If `$ARGUMENTS` names a request id, use it. Otherwise resolve the active one:

```
node "${CLAUDE_PLUGIN_ROOT}/bin/vibe.mjs" status --project-dir "${CLAUDE_PROJECT_DIR}" --json
```

Read `${CLAUDE_PROJECT_DIR}/requests/<id>/understanding.md` and every accepted
ADR for the request (`docs/adrs/*.md` whose frontmatter `request: <id>` and
`status: accepted`). If understanding is missing or not `clarified`, stop and
point at `/vibe-flow:understand`. If any ADR for the request is still
`proposed`, point at `/vibe-flow:decide` first.

## 1. Create the plan skeleton

```
node "${CLAUDE_PLUGIN_ROOT}/bin/vibe.mjs" plan --request <id> --project-dir "${CLAUDE_PROJECT_DIR}" --json
```

The helper is idempotent: it writes `plans/<id>.md` only when absent and
returns `reused: true` otherwise, so re-entering this phase never clobbers a
plan body. **This command is the single caller of `vibe plan`** — the planner
writes into the skeleton, it does not call the helper itself.

## 2. Delegate drafting to the planner

Spawn the `vibe-planner` subagent (single Task call). Hand it the request id,
the understanding path, and the accepted ADR paths. Instruct it to fill the
`plans/<id>.md` frontmatter `steps:` — each step with:

- `id`, `intent` (what the step achieves),
- `files` — the files it may touch (this is the step's scope),
- `satisfies` — the requirement id(s) it covers,
- `tests` — `path::name` references that will prove it,
- `status: todo`.

Every requirement must be covered by ≥1 step; every accepted ADR `constraint`
must be honored; keep it lazy — the shortest plan that actually works.

**ultra:** spawn two divergent drafts (one "minimal", one "robust") to distinct
scratch paths in a single batch, then a sequential synthesis step merges the
best of each into `plans/<id>.md`.

## 3. Adversarial plan review (full / ultra)

Spawn the `vibe-plan-reviewer` subagent on the drafted plan. It hunts coverage
holes, untested behavior-changing steps, scope creep, over-engineering (ponytail
lens), ADR violations, and risky ordering, and returns `pass | revise` plus
concrete required changes — it does not rewrite. Allow at most **one** revision
loop (planner fixes, reviewer re-checks). If still blocking, proceed but persist
the findings in the plan body rather than silently dropping them.

## 4. Finalize

Once `vibe-plan-reviewer` returns **pass** (or after the one allowed revision
loop — persisting any remaining findings in the plan body rather than dropping
them), **this command** sets the plan frontmatter `status: reviewed`. The planner
and the plan-reviewer never set it: the planner leaves the draft at `status:
draft`, and the reviewer does not edit the file. The PostToolUse hook resyncs the
plan index on save.

Report the plan path, step count, requirement coverage, and the reviewer
verdict. Advisory next step: **/vibe-flow:implement**.
