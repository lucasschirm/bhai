# `src/conversation/` — conversation primitives

## Purpose & scope
Holds the ordered-fold event primitive and the system-prompt resolution it backs. Landed on `main` ahead of the kernel scaffolding and merged into it; it is the only place today that implements system-prompt layering (replace vs. append ordering across `start` handlers). The kernel's own `Conversation` (ARCHITECTURE.md § 11, TASK_0023) is not built yet — when it is, that task decides whether to absorb this module or keep it as the underlying fold primitive.

## Key files
- `event-bus.ts` — minimal typed bus with two dispatch styles: `emit` (plain fan-out) and `fold` (ordered fold threading a running value through handlers).
- `system-prompt.ts` — `Conversation`, resolving `start` handlers into a `ResolvedSystemPrompt` via `fold`, so replace-then-append ordering is preserved. Also carries per-conversation plugin activation: `onStart(handler, owner?)` attributes a handler to a plugin, and `enablePlugin`/`disablePlugin`/`resetPlugin` override the kernel's global state for this conversation alone.

## Conventions
- **Two `EventBus` classes exist in this repo.** `core/event-bus.ts` is the framework-wide bus (§ 8: patch chaining, blockable dispatch, reserved namespaces, FIFO serialization) and owns the unqualified `EventBus` name in the root barrel. This module's narrower bus is re-exported from `src/index.ts` as `ConversationEventBus`; `src/index.test.ts` guards that split. Do not re-export it unaliased — `export *` from `./core` would be silently shadowed rather than erroring.
- **This module does not import `src/core/`.** `Conversation` reaches global plugin activation through the structural `PluginActivationSource` interface (`isPluginEnabled` + `listPlugins`), which `BHAI` satisfies without declaring it. Keep it that way — a hard import would couple the two subtrees that `src/index.ts` currently has to alias around.
- **Activation is snapshotted, not live.** `ensureStarted()` caches the resolution for the conversation's lifetime, so a toggle after the conversation has started changes nothing until `restart()` is called. That is deliberate: a running conversation's system prompt must not mutate underneath it. `restart()` re-runs every handler, so `start` handlers must tolerate running more than once.
- Tests are colocated as `<name>.test.ts` (see `src/AGENTS.md`).
- Relative imports carry `.js` extensions, as everywhere under `src/`.

## Consumers
- `src/index.ts` — root barrel; this module has no `package.json` subpath export of its own.
