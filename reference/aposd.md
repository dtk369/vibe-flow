# APoSD digest — A Philosophy of Software Design (Ousterhout)

> REFERENCE ONLY — not a command, not invokable. The vibe-flow architect, planner,
> and reviewer CITE these heuristics when justifying decisions, plans, and findings.
> One line each, with a "use when" trigger. The goal is fighting complexity.

## Core lens
- **Complexity = dependencies + obscurity.** Every change cost, unknown unknown, and "what does this affect?" is one of these two. *Use when:* judging whether any design is getting better or worse.
- **Strategic over tactical.** Invest a little now to keep the design clean; tactical patches accrete into a mess. *Use when:* tempted to ship the quick hack "just this once."

## Module heuristics
- **Deep modules, not shallow.** Best modules hide a lot behind a tiny interface; a shallow module's interface costs as much as its body. *Use when:* a class/function's signature is nearly as complex as what it does — merge or deepen it.
- **Information hiding.** Bury design decisions (formats, algorithms, deps) inside a module so callers never depend on them. *Use when:* a detail leaks into multiple callers — pull it behind the interface.
- **Pull complexity downward.** When in doubt, the module owner eats the complexity so every caller stays simple. *Use when:* choosing between a simple internal vs. a simpler-looking API that pushes work onto users.
- **General-purpose enough.** Make interfaces somewhat general; it's often simpler AND covers future needs without speculative knobs. *Use when:* an API is so special-cased it only fits today's one caller.
- **Different layer, different abstraction.** Adjacent layers that expose the same abstraction (pass-through methods, duplicated types) signal a missing or redundant layer. *Use when:* a method just forwards to the next layer unchanged.

## Errors & interfaces
- **Define errors out of existence.** Redesign the API so the error case can't happen (e.g. tolerant defaults, no-op on empty) instead of forcing every caller to handle it. *Use when:* an exception/edge case is being propagated to many callers.

## Process heuristics
- **Design it twice.** Sketch two or more genuinely different approaches before committing; the comparison reveals the better design. *Use when:* a load-bearing decision (the ADR moment) — this is the architect's default.
- **Comments as design, written first.** If a clean comment is hard to write, the design is probably too complex; comments capture what code can't (the why, the contract). *Use when:* an interface is awkward to describe — fix the design, not the prose.
- **Obvious code.** Code should be obvious to a reader; if reviewers ask "what does this do?", that's obscurity to remove, not document around. *Use when:* a reviewer stumbles — prefer a clearer structure over a defensive comment.
