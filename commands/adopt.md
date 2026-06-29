---
description: "Phase 0 — adopt vibe-flow into an existing codebase: record the as-built architecture as accepted ADRs, run /ponytail-audit, and seed a cleanup request from the findings."
argument-hint: "[lite|full|ultra]"
---

# /vibe-flow:adopt

Bootstrap vibe-flow into an **existing** codebase. It captures the as-built architecture as accepted ADRs (so every future request's clarifier/architect/planner stays consistent with what is already there instead of silently re-deciding it), runs a whole-repo over-engineering audit, and seeds a tracked cleanup request from the findings. Advisory and lazy: it records reality and suggests work — it never rewrites your code.

Effort (`$ARGUMENTS`, default `full`) scales how deeply it surveys and how many lenses it runs.

## 0. Detect prior adoption

```
node "${CLAUDE_PLUGIN_ROOT}/bin/vibe.mjs" status --project-dir "${CLAUDE_PROJECT_DIR}" --json
```

If `docs/adrs/` already holds accepted as-built ADRs (`request: baseline`) or requests already exist, this codebase is already (partly) adopted. Do NOT duplicate — refresh instead: update any stale baseline ADR and re-run the audit, rather than re-creating everything.

## 1. Survey the codebase (read-only)

Understand the project shape before recording anything: language(s), frameworks, entry points, module boundaries, the data model / persistence, external services, test setup, and the conventions already in force. For a large repo, delegate the survey to a read-only **Explore** subagent (breadth follows effort: `full` → moderate, `ultra` → multiple locations + naming conventions); for a small one, read the load-bearing files directly. Adopt never edits source.

## 2. Record the as-built architecture as accepted ADRs

The existing code already encodes load-bearing decisions — module boundaries, the data model, the persistence/concurrency/error strategy, key dependencies, security/trust boundaries. Capture the **few** that future work must stay consistent with (aim for the smallest set — often 1–5; skip the trivial). These are exactly what the clarifier, architect, and planner read from `docs/adrs/INDEX.md` to avoid re-litigating settled architecture.

For each as-built decision:

1. Allocate the ADR skeleton:
   ```
   node "${CLAUDE_PLUGIN_ROOT}/bin/vibe.mjs" adr --request baseline --title "<as-built decision>" --project-dir "${CLAUDE_PROJECT_DIR}" --json
   ```
   `--request baseline` ties these to a **pseudo-request**: they appear in the ADR index and constrain future requests, but they are not a real request and never affect request routing or `status`.
2. **Edit the returned ADR file in place** (do NOT call `vibe adr` again — it would allocate a fresh number and orphan this one). Set `status: accepted`; fill **Context** (what the code does today), **Decision** (the as-built choice), **Consequences**, and `principles:` citing the bundled digests `${CLAUDE_PLUGIN_ROOT}/reference/aposd.md` / `${CLAUDE_PLUGIN_ROOT}/reference/tigerstyle.md`. Add `as_built: true` in the body so it reads as documentation of reality, not a fresh proposal.

**ultra:** add a second pass for the cross-cutting decisions (errors / concurrency / security boundary) a single read tends to miss.

## 3. Conduct /ponytail-audit (graceful degradation)

Run a whole-repo over-engineering audit:

- If the **ponytail** plugin is installed, invoke **`/ponytail-audit`** — it returns a ranked list of what to delete, simplify, or replace with stdlib/native equivalents.
- Otherwise apply the audit mindset inline (reinvented stdlib, speculative abstractions, dead flexibility, premature config, unneeded dependencies) and note that `/ponytail-audit` was unavailable.

A conducted tool that errors or times out is recorded as a finding, never a silent pass.

## 4. Seed a cleanup request from the audit

Turn the audit into actionable, tracked work:

1. ```
   node "${CLAUDE_PLUGIN_ROOT}/bin/vibe.mjs" new "ponytail-audit cleanup" --project-dir "${CLAUDE_PROJECT_DIR}" --json
   ```
   Capture `{id, understanding}`.
2. Fill `understanding.md`: each high-value cut from the audit becomes a testable `requirements:` entry (what to delete/simplify, and the behavior that must stay intact); audit items deliberately deferred go in `scope_out:` (YAGNI — don't gold-plate the cleanup either). Add the relevant baseline ADR ids to `adrs:` so the cleanup honors the as-built architecture. List any genuine ambiguity in `open_questions:`.
3. Set `status: clarified` only if `requirements` is non-empty and no blocking `open_questions` remain — otherwise the workflow will not route past `understand`. Leave it `draft` while questions are pending.

If the audit found nothing worth changing, say so and **skip the request** — don't manufacture cleanup.

## 5. Sync and report

```
node "${CLAUDE_PLUGIN_ROOT}/bin/vibe.mjs" sync --project-dir "${CLAUDE_PROJECT_DIR}"
```

Report: the as-built ADRs recorded (id + decision), the audit's top ranked findings, the seeded cleanup request id, and what `/ponytail-audit` contributed or why it was skipped. Invite the user to review the baseline ADRs and reject any that don't match intent.

**Advisory next step:** review the seeded request, then **/vibe-flow:plan** (or **/vibe-flow:auto "ponytail-audit cleanup"**) to act on it. New feature work starts as usual with **/vibe-flow:understand** — it will now honor the as-built ADRs.
