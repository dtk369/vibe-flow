# TigerStyle digest (reference)

> Reference only — NOT a command. A compact set of TigerStyle (TigerBeetle)
> heuristics for vibe-flow's **decide** and **plan** phases to cite. Use the
> trigger on each line to decide when a heuristic earns its place. Lazy spirit:
> cite what's load-bearing, skip the rest.

## Safety
- **Assert pre/postconditions** — encode invariants as asserts. *Use when* a function has assumptions a caller could break.
- **Handle all errors** — every error path is a real path; no swallowed failures. *Use when* a call can fail (I/O, parse, network).
- **Bounded loops** — every loop has an explicit upper bound. *Use when* iterating over external/growing input or retrying.
- **Explicit limits** — set hard caps on sizes, counts, timeouts up front. *Use when* a resource could grow unbounded (queues, batches, fan-out).
- **No unbounded allocation** — allocate from fixed budgets, not on demand. *Use when* memory/handles scale with untrusted input.

## Performance
- **Design for the bottleneck** — optimize the actual constraint (I/O, network, disk), not guesses. *Use when* choosing an architecture or data path.
- **Batch** — amortize per-item cost over groups. *Use when* many small ops hit the same expensive resource.
- **Napkin math first** — estimate throughput/latency/size before building. *Use when* a decision hinges on whether a design can possibly meet its numbers.

## Developer experience
- **Simplicity** — the simplest thing that works; remove before adding. *Use when* tempted by a clever or general abstraction (pairs with ponytail).
- **Zero technical debt** — do it right the first time; debt compounds. *Use when* a shortcut would leave a known-broken seam.
- **Name things precisely** — names carry intent; vague names hide bugs. *Use when* introducing a type, function, or field.
- **Small functions** — short, single-purpose units (~70 lines). *Use when* a function grows past one clear job.
