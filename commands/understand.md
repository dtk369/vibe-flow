---
description: "Phase 1 (understand) — triage a goal, clarify it, and capture requirements/scope into requests/<id>/understanding.md."
argument-hint: "<goal>"
---

# /vibe-flow:understand

Phase 1 of vibe-flow. Turn a raw goal into a clear, durable understanding artifact. Advisory only — never block; suggest the next step when done.

Goal argument: `$ARGUMENTS`

## 1. Locate or create the request

First check whether an active request already exists:

```
node "${CLAUDE_PLUGIN_ROOT}/bin/vibe.mjs" status --project-dir "${CLAUDE_PROJECT_DIR}" --json
```

- If status reports an active request whose understanding still needs work (status `draft` or non-empty `open_questions`), keep working on THAT request — do not create a new one. Read its `requests/<id>/understanding.md`.
- If a goal argument IS present and there is no active request to continue, allocate a fresh request and skeleton:

```
node "${CLAUDE_PLUGIN_ROOT}/bin/vibe.mjs" new "$ARGUMENTS" --project-dir "${CLAUDE_PROJECT_DIR}" --json
```

  Capture the printed `{ id, dir, understanding }` — `understanding` is the path to fill.
- If no goal argument is present and there is no active request, ask the human for the goal in one short prompt, then run `new` as above. Don't invent a goal.

## 2. Clarify via the subagent

Delegate to the **vibe-clarifier** subagent (single Task call). Pass it the request `id`, the goal, and the absolute path to `understanding.md`. Instruct it to:

- Triage and push back on a vague or over-scoped goal (ponytail spirit — the simplest thing that works; question whether work is even needed).
- Fill the understanding frontmatter: `requirements`, `open_questions`, `scope_in`, `scope_out`.
- NOT call AskUserQuestion (it runs in a subagent). Instead RETURN any genuinely blocking questions for the main thread, each with a recommended default.

If the clarifier returns **zero requirements**, that blocks progression — re-run it or resolve with the human before continuing.

## 3. Ask blocking questions on the MAIN THREAD

For each genuinely blocking question the clarifier returned, ask the human here using **AskUserQuestion** (only on the main thread). Skip questions that are reversible or have an obvious default — record the assumption instead. Write the answers back into `understanding.md` (resolve the matching `open_questions`, refine `requirements`/`scope`).

## 4. Mark clarified

The clarifier sets `status: clarified` itself when it returns no blocking questions. If it returned questions that you have now resolved (step 3), **this command** sets `status: clarified` once no blocking `open_questions` remain and `requirements` is non-empty. Leave it `draft` while questions are still pending — and note the helper will not route past `understand` until both hold.

## 5. Advisory next step

Print the helper's recommendation and stop:

```
node "${CLAUDE_PLUGIN_ROOT}/bin/vibe.mjs" status --project-dir "${CLAUDE_PROJECT_DIR}"
```

Typically the next step is `/vibe-flow:decide` (if load-bearing decisions exist) or `/vibe-flow:plan`. Suggest it; never run it automatically.