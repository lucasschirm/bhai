# `src/plugins/interop/pi/` — pi coding-agent extension interop

## Purpose & scope
Adapter bridging a subset of pi coding-agent extensions onto BHAI's plugin surface (ARCHITECTURE.md § 12). Lets a host reuse existing pi extensions (tools, commands, hooks) without rewriting them as BHAI plugins.

## Key files
- `index.ts` — subpath entry. Currently a stub (`export {}`) populated by a future interop task.

## Conventions
- **Subset, not full fidelity**: only the pi extension features that map cleanly onto BHAI's plugin surface are supported. Features with no BHAI equivalent are surfaced as host-visible no-ops or flagged, not silently dropped.
- **pi's `complete()`** maps onto `bh.complete()` (§ 6); pi's `thinkingLevel` maps onto `GenerationParams.reasoning` (§ 10.1).

## Consumers
- `src/index.ts` re-exports this entry.
- `tsup.config.ts` builds it to `dist/plugins/interop/pi/index.js` + `.d.ts`.
- Hosts with an existing pi extension ecosystem import `@lucasschirm/bhai/plugins/interop/pi` to reuse extensions.
