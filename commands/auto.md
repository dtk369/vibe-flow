---
description: Drive all five vibe-flow phases (understand→decide→plan→implement→review) end-to-end with subagents; pause only for irreversible/ambiguous decisions.
argument-hint: "<goal> [lite|full|ultra] [--yolo]"
---

# /vibe-flow:auto

You are the AUTO driver. You run on the MAIN THREAD, so you (and only you) may call `AskUserQuestion`. Subagents NEVER ask the human — they RETURN questions for you to ask. Orchestrate the five phases per the steps below. Be lazy: do the simplest thing that satisfies each step; skip absent tools and note it.

## 0. Parse arguments and set invariants

From `$ARGUMENTS`:
- **goal** = the free text (required; if empty, ask once for it and stop until provided).
- **effort** ∈ {`lite`,`full`,`ultra`}, default **`full`**.
- **`--yolo`** = present or not (default not).

Hold these invariants for the whole run:
- **Helper calls** use EXACTLY: `node "${CLAUDE_PLUGIN_ROOT}/bin/vibe.mjs" <sub> ... --project-dir "${CLAUDE_PROJECT_DIR}" --json`. The helper writes skeletons + indexes; subagents write artifact BODIES.
- **Context bus = artifact PATHS, not pasted bodies.** Pass each subagent the paths produced by prior phases; it reads what it needs.
- **Validate between phases and at the end:** run `node "${CLAUDE_PLUGIN_ROOT}/bin/vibe.mjs" validate --project-dir "${CLAUDE_PROJECT_DIR}" --json` after each phase; fold findings into the final summary (don't hard-fail on advisory warnings).
- **Transient status:** when a phase begins, expect it to leave an in-progress status (e.g. plan `implementing`) so a crash/resume is recoverable. Note the active request id as you go.
- **Budget cap:** at most ~12 subagent spawns and one review→implement retry budget (max 2) for the whole run. If you would exceed it, stop and summarize instead of spawning more.
- **Unattended gate handling:** if you reach a human gate you cannot resolve (see Step 2 / irreversible classes) and the run is unattended, **halt the request** — record what is pending in the artifact body as a `blocked_on:` note (do NOT invent a `status: blocked` value; the schema does not allow it, so leave `status` at its current valid value), run `sync`, print the summary, and **exit 0 — never hang.**

### Irreversible classes (hard-stop or sandbox even under `--yolo`)
Destructive data/schema migration · credential/secret changes · money-spending or external side-effect calls · file deletion · force-push · prod deploy · security-boundary changes. `--yolo` silences only **reversible** ambiguity; these always pause (or run sandboxed/dry-run). Everything else is reversible → auto-proceed.

## 1. Understand

1. Allocate the request and skeleton: `node "${CLAUDE_PLUGIN_ROOT}/bin/vibe.mjs" new "<goal>" --project-dir "${CLAUDE_PROJECT_DIR}" --json`. Capture `{id, dir, understanding}`. (Effort is orchestration-only — you hold it for fan-out and pass it to subagents; it is not stored in the artifact.)
2. Spawn **vibe-clarifier** (Task) with the goal and the `understanding` path; it triages, clarifies, and writes the body.
3. **ultra only:** in the SAME batch, spawn a second risk-lens clarifier; then merge both into one understanding (sequential merge step).
4. If the clarifier returns blocking questions: under `--yolo` record a chosen assumption for each open_question into understanding.md and proceed; otherwise ask them on the MAIN THREAD via `AskUserQuestion`, then fold the answers into understanding.md (resolve the matching `open_questions`, refine `requirements`). Once no blocking `open_questions` remain and `requirements` is non-empty, **the driver** sets `status: clarified` (the clarifier already set it if it returned no blocking questions).
5. **Guard:** zero requirements ⇒ progression is blocked. Re-clarify once; if still zero, halt: record a `blocked_on:` note in understanding.md (leave `status` at its valid value — `draft`), summarize, exit.

## 2. Decide

1. Spawn **vibe-architect** (Task) with the understanding path. It derives load-bearing decisions, cites the APoSD/TigerStyle digests, stages **proposed** ADRs, and RETURNS questions + a recommendation. It NEVER accepts.
2. **ultra only:** run a sequential red-team pass over each recommendation before deciding.
3. Resolve each decision:
   - **lite or `--yolo`:** auto-accept the architect's recommendation.
   - **full / ultra:** ask the decisions on the MAIN THREAD via `AskUserQuestion` (one question per decision, with the recommendation surfaced).
   - **No confident recommendation:** pause even in `full`; under `--yolo` pick a documented default and flag it in the ADR.
4. For each decision, **edit the proposed ADR the architect already staged** (it returned each `adr_path`) — set the body + `status: accepted` (or `rejected`). Do NOT call `vibe adr` again: it always allocates a fresh number, leaving an orphan `proposed` ADR that keeps `computeNext` pinned in `decide`. Auto-accepted ADRs (lite/`--yolo`) are stamped `auto_accepted: true`.

## 3. Plan

1. Skeleton: `node "${CLAUDE_PLUGIN_ROOT}/bin/vibe.mjs" plan --request <id> --project-dir "${CLAUDE_PROJECT_DIR}" --json`.
2. Draft:
   - **lite / full:** spawn **vibe-planner** once to write the file-by-file plan covering every requirement.
   - **ultra:** spawn **N=2 divergent drafts** — one "minimal", one "robustness" — as a SINGLE message with concurrent Task calls, each writing to a DISTINCT scratch path (not the real plan). Then a sequential judge/synthesize step picks/merges into one plan.
   - The final plan body is written once (via the planner/synthesizer) into `plans/<id>.md`; the helper only made the skeleton.
3. **vibe-plan-reviewer** (full/ultra): run ONCE on the synthesized plan — adversarial coverage/tests/scope/over-engineering check; it returns a verdict + required changes, does not rewrite. Allow at most 1 revision loop (planner revises, reviewer re-checks). If still blocking, proceed but persist the findings in the plan frontmatter (never silently drop).
4. **Guard:** zero steps ⇒ blocked. Halt: record a `blocked_on:` note in the plan body (leave `status` at its valid value — `draft`), summarize, exit. On success — the plan-reviewer passes (or the one revision loop completes) — **the driver** sets the plan top-level `status: reviewed` (neither the planner nor the reviewer sets it; the planner leaves `draft`, the reviewer does not edit).

## 4. Implement

1. **Checkpoint first:** take a recoverable git checkpoint (commit/branch/stash) before any edit, so the run can roll back.
2. Spawn **vibe-implementer** — **ALWAYS a single subagent, never fanned out.** Give it the plan path and the run effort (ponytail intensity follows it). It sets the plan `status: implementing`, then builds to the plan with the simplest code, constrained to **plan-declared files**, conducting tools with standard degradation:
   - ponytail skill if available, else apply the lazy mindset inline;
   - `/simplify` if available, else skip and note;
   - `/frontend-design` for UI files if available, else skip and note.
   It leaves a runnable check and marks step statuses (plan → `implementing`, steps `done`).
3. If implementing hits an irreversible class, pause/sandbox per Step 0 (even under `--yolo`).

## 5. Review

1. Review pass:
   - **lite / full:** spawn **vibe-reviewer** once with the plan + understanding paths.
   - **ultra:** spawn the review **lenses** — **correctness** and **security** — as a SINGLE batch of concurrent **vibe-reviewer** Task calls, each focused on its lens. Tell each lens reviewer to **SKIP the `vibe review` skeleton step** (that helper always targets the one fixed `requests/<id>/review.md` and would race/overwrite) and instead write ONLY to its assigned DISTINCT scratch path passed in the Task prompt. Then a sequential synthesis step merges those scratch outputs and is the **single caller** of `node "${CLAUDE_PLUGIN_ROOT}/bin/vibe.mjs" review --request <id> --project-dir "${CLAUDE_PROJECT_DIR}" --json`, producing the final `requests/<id>/review.md`. Drop the acceptance lens (that is the human gate) and any over-engineering lens that would duplicate `/simplify` (the ponytail over-engineering lens is already conducted below).

   The reviewer conducts, with degradation, recording any tool that errors/times out as a FINDING (distinct from absent→skip-and-note):
   - `/run` (tests), `/code-review`, `/security-review`;
   - ponytail over-engineering lens: `/ponytail-review` if the ponytail plugin is installed, else apply the mindset inline.
   It flags any out-of-scope edits and classifies failures by root cause. In **lite/full** (single reviewer) the reviewer creates the skeleton and writes `review.md` via `node "${CLAUDE_PLUGIN_ROOT}/bin/vibe.mjs" review --request <id> --project-dir "${CLAUDE_PROJECT_DIR}" --json`; in **ultra** the per-lens reviewers write only to scratch and the synthesis step performs that single `vibe review` call.
2. **Guards:** `/run` executed zero tests ⇒ cap at `status: partial` (never `pass`). Any security critical/high finding ⇒ `status: fail`.
3. **On fail — route by root cause, re-running to confirm the failure reproduces (scoped to the changed diff) before consuming an iteration:**
   - plan/coverage gap ⇒ loop to **Step 3 (plan)**;
   - code defect ⇒ loop to **Step 4 (implement)**.
   - **review→implement max 2.** Still failing ⇒ write `review.md` `status: fail`, stop, surface the summary, do **NOT** mark done.

## 6. Sync and report

1. `node "${CLAUDE_PLUGIN_ROOT}/bin/vibe.mjs" sync --project-dir "${CLAUDE_PROJECT_DIR}" --json`.
2. Print a final summary listing **every artifact path** (`requests/<id>/understanding.md`, each `docs/adrs/A####-*.md`, `plans/<id>.md`, `requests/<id>/review.md`) and, **per tool**, what it contributed or why it was skipped — plus the final review status and any `validate` findings.
