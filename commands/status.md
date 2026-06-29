---
description: Show the advisory state of each vibe-flow request — current phase, artifacts, and the suggested next command.
argument-hint: "[req-id]"
---

# /vibe-flow:status

Report where each request stands in the five-phase flow (understand → decide → plan → implement → review) and what to run next. This is advisory only — the helper output is authoritative; do not recompute phases yourself.

## Run the helper

Invoke the state helper. If `$ARGUMENTS` names a request id, scope to it; otherwise report the active request and, for the full list, read the index.

With a request id:

```
node "${CLAUDE_PLUGIN_ROOT}/bin/vibe.mjs" status --request $ARGUMENTS --project-dir "${CLAUDE_PROJECT_DIR}" --json
```

Without arguments, the helper reports the single **active** request as JSON:

```
node "${CLAUDE_PLUGIN_ROOT}/bin/vibe.mjs" status --project-dir "${CLAUDE_PROJECT_DIR}" --json
```

For **all** requests, read `${CLAUDE_PROJECT_DIR}/requests/INDEX.md` — the helper keeps it current with one row per request (id, goal, status, phase, next).

## Report

From the helper JSON (one active request, always exit 0) or the `requests/INDEX.md` table (all requests), present per request:

- the request id and goal,
- its advisory current phase,
- the existing artifacts (understanding / ADRs / plan / review) with their paths,
- the advisory next command to run.

If there are no requests yet, say so and suggest `/vibe-flow:understand "<goal>"` (or `/vibe-flow:auto "<goal>"`) to start one. Keep it tight — a short line or small table per request, no editorializing beyond the helper's findings.
