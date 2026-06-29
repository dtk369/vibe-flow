---
description: Phase 2 — derive load-bearing decisions and record them as ADRs (human gate).
argument-hint: "[request-id]"
---

# /vibe-flow:decide

Phase 2 of the vibe-flow workflow. Turn the open questions and load-bearing
choices from understanding into recorded decisions (ADRs). This command runs a
human gate: the architect proposes, you decide on the MAIN THREAD.

## 0. Locate the request

If `$ARGUMENTS` names a request id, use it. Otherwise resolve the active one:

```
node "${CLAUDE_PLUGIN_ROOT}/bin/vibe.mjs" status --project-dir "${CLAUDE_PROJECT_DIR}" --json
```

Read `${CLAUDE_PROJECT_DIR}/requests/<id>/understanding.md`. If it is missing,
stop and point the user at `/vibe-flow:understand`.

## 1. Delegate derivation to the architect

Spawn the `vibe-architect` subagent (single Task call). Hand it the request id
and the full understanding.md. Instruct it to:

- Derive only the LOAD-BEARING decisions — the few choices that are hard to
  reverse or that shape everything downstream. Skip reversible trivia.
- For each, return ONE question with 2–4 concrete options, exactly one option
  clearly marked **(recommended)**, and a short rationale citing the bundled
  digests `reference/aposd.md` (deep modules, complexity) and
  `reference/tigerstyle.md` (simplicity, safety, limits).
- Stage proposed ADRs but NEVER accept them.
- RETURN the decision questions to this thread — it must not call
  AskUserQuestion itself.

If the architect returns no confident recommendation for a decision, do not
guess: surface it as an open choice and let the human pick.

## 2. Ask the human (MAIN THREAD)

For each returned decision, call `AskUserQuestion` here on the main thread with
the options and recommendation. AskUserQuestion only works on the main thread —
this is the only place it may be called in this phase.

Group related questions into a single AskUserQuestion call where natural. Keep
the recommended option visible in each question's text.

## 3. Record each verdict as an ADR

The architect already staged one **proposed** ADR per decision (it returned each
`adr_id` / `adr_path`). Do NOT call `vibe adr` again — it always allocates a
fresh number and would leave an orphaned `proposed` ADR that pins the request in
`decide` forever. Instead, **edit the existing ADR file in place**: set its
verdict and fill the body. (Only allocate a new ADR with `vibe adr` if you want
to additionally record a separately-rejected alternative as its own file.)

Edit the staged ADR file body to capture:

- **Decision** — the option the human chose.
- **Context** — the forces and the relevant requirement(s) it serves.
- **Consequences** — what this makes easy, what it costs, what it rules out.
- **Constraints** — invariants downstream phases must honor.

Set frontmatter `status: accepted` for the chosen path, or `status: rejected`
for an explicitly declined alternative worth recording. Cite the principle(s)
that backed the recommendation in the body. Add the ADR id to the
understanding.md `adrs:` list.

The PostToolUse hook re-syncs the ADR index on save; if in doubt run:

```
node "${CLAUDE_PLUGIN_ROOT}/bin/vibe.mjs" sync --project-dir "${CLAUDE_PROJECT_DIR}"
```

## 4. Hand off

Report each decision, its ADR path, and the cited principle. Advisory next
step: **/vibe-flow:plan**.