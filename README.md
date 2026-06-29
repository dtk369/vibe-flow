# vibe-flow

An orchestration-first, advisory, auto-capable development workflow for Claude Code. vibe-flow **sequences** best-of-breed tools instead of reimplementing them, and **never blocks your edits**. It is lazy by design (ponytail spirit): it suggests the next step, it does not gate you. Run one command per phase when you want control, or hand it a goal and let `auto` drive all five phases end-to-end — pausing only for genuinely irreversible decisions.

## Install

```
/plugin marketplace add dtk369/vibe-flow
/plugin install vibe-flow
/reload-plugins
```

## The five phases

Each phase has a command and writes one durable, indexed markdown artifact (frontmatter + body). The request id is `NNNN-<slug>` (e.g. `0001-rate-limit`).

| Phase | Command | Artifact |
|-------|---------|----------|
| 1. understand | `/vibe-flow:understand` | `requests/<id>/understanding.md` |
| 2. decide | `/vibe-flow:decide` | `docs/adrs/A####-<slug>.md` (+ `docs/adrs/INDEX.md`) |
| 3. plan | `/vibe-flow:plan` | `plans/<id>.md` (+ `plans/INDEX.md`) |
| 4. implement | `/vibe-flow:implement` | source code (+ plan step status) |
| 5. review | `/vibe-flow:review` | `requests/<id>/review.md` |

`/vibe-flow:status` reads the artifacts and tells you the current phase and the next command to run.

## Run modes

**Interactive** — one command per phase. Human gates run on the main thread: decisions are surfaced with `AskUserQuestion` in `decide`, and you review the plan before implementing.

**Auto** — `/vibe-flow:auto "<goal>" [lite|full|ultra] [--yolo]` drives all five phases via subagents, using the artifact paths as the context bus. It pauses only for irreversible/ambiguous decisions (never, with `--yolo`). If it hits a human gate in an unattended run it marks the request `blocked`, writes what is pending, and exits — it never hangs.

```
/vibe-flow:auto "add per-IP rate limiting to the public API" full
```

This allocates request `0001-add-per-ip-rate-limiting`, clarifies it, surfaces the load-bearing decisions, plans file-by-file, implements to the plan, and reviews — leaving understanding.md, an ADR, a plan, code, and review.md behind.

## Effort levels

Effort scales subagent fan-out. Every fan-out is bounded.

- **lite** — one subagent per phase; decisions auto-accept the recommendation (stamped `auto_accepted: true`); review is a single pass.
- **full** (default) — decisions surfaced as questions with a recommendation; the plan gets one independent reviewer; review runs the full tool chain.
- **ultra** — bounded panels: a second risk-lens clarifier; a red-team pass before recommending decisions; two divergent plan drafts (minimal vs robust) judged and synthesized; multi-lens review (correctness / security / over-engineering / acceptance). Bounded extra coverage, not exhaustive. Implement is always a single subagent.

## Orchestration by instruction + graceful degradation

vibe-flow cannot programmatically call another plugin's command, so each phase prompt **tells the model which tool to invoke**, with the standard degradation phrasing: *"If `<tool>` is available, do X; otherwise skip and note it was skipped."* A conducted tool that errors or times out is recorded as a finding, never a silent pass.

- **Reliable** (assume present): `/simplify`, `/run`, `/code-review`, `/security-review`.
- **Optional** (detect at runtime; skip + note if absent): `ponytail` (implement + its `/ponytail-review` over-engineering lens), `/frontend-design` (UI files).
- **Reference** (NOT invokable — bundled digests under `reference/`): APoSD (`reference/aposd.md`) and TigerStyle (`reference/tigerstyle.md`), cited during decide and plan.

Where tools are conducted: **implement** → ponytail + `/simplify` (+ `/frontend-design` for UI files); **review** → `/run` + `/code-review` + `/security-review` + the ponytail over-engineering lens (`/ponytail-review` if installed, else the mindset inline).

## Persistence layout

```
requests/
  INDEX.md
  <id>/understanding.md
  <id>/review.md
docs/adrs/
  INDEX.md
  A####-<slug>.md
plans/
  INDEX.md
  <id>.md
```

The model writes the artifact bodies; the helper writes the skeletons and the indexes from frontmatter.

## State helper — `bin/vibe.mjs`

Zero-dependency Node >=18 (ESM). Not a state machine — just ids, indexes, and frontmatter. Every subcommand accepts `--project-dir <dir>` (default cwd) and `--json`.

| Subcommand | Does |
|------------|------|
| `new "<goal>"` | allocate next request id, create understanding.md skeleton, regenerate requests index |
| `adr --request <id> --title "<t>"` | allocate next ADR skeleton (status: proposed) |
| `plan --request <id>` | create plan skeleton (status: draft) |
| `review --request <id>` | create review.md skeleton (status: partial) |
| `sync` | regenerate all three INDEX.md + advisory frontmatter validation; always exit 0 |
| `status [--request <id>] [--hook session]` | compute advisory current phase + next command |
| `validate [--path <f>]` | check frontmatter fields + status; nonzero exit on findings (manual/CI) |
| `help` | usage |

## Hooks

Both hooks are advisory, non-blocking, and run on the main thread:

- **SessionStart** (startup|resume|clear|compact) — prints one context line for an active request:
  `node "${CLAUDE_PLUGIN_ROOT}/bin/vibe.mjs" status --project-dir "${CLAUDE_PROJECT_DIR}" --hook session`
- **PostToolUse** (Edit|Write|MultiEdit) — regenerates the indexes after edits:
  `node "${CLAUDE_PLUGIN_ROOT}/bin/vibe.mjs" sync --project-dir "${CLAUDE_PROJECT_DIR}"`

## License

MIT © icento <ky.dangthe@icento.com.vn>
