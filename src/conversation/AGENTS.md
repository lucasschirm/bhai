# `src/conversation/` — conversation primitives

## Purpose & scope
Holds the ordered-fold event primitive and the system-prompt resolution it backs. Landed on `main` ahead of the kernel scaffolding and merged into it; it is the only place today that implements system-prompt layering (replace vs. append ordering across `start` handlers). The kernel's own `Conversation` (ARCHITECTURE.md § 11, TASK_0023) is not built yet — when it is, that task decides whether to absorb this module or keep it as the underlying fold primitive.

## Key files
- `event-bus.ts` — minimal typed bus with two dispatch styles: `emit` (plain fan-out) and `fold` (ordered fold threading a running value through handlers).
- `system-prompt.ts` — `Conversation`, resolving `start` handlers into a `ResolvedSystemPrompt` via `fold`, so replace-then-append ordering is preserved.

## Conventions
- **Two `EventBus` classes exist in this repo.** `core/event-bus.ts` is the framework-wide bus (§ 8: patch chaining, blockable dispatch, reserved namespaces, FIFO serialization) and owns the unqualified `EventBus` name in the root barrel. This module's narrower bus is re-exported from `src/index.ts` as `ConversationEventBus`; `src/index.test.ts` guards that split. Do not re-export it unaliased — `export *` from `./core` would be silently shadowed rather than erroring.
- Tests are colocated as `<name>.test.ts` (see `src/AGENTS.md`).
- Relative imports carry `.js` extensions, as everywhere under `src/`.

## Consumers
- `src/index.ts` — root barrel; this module has no `package.json` subpath export of its own.
