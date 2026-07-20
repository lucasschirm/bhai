# BHAI Implementation Progress

Tracks the implementation status of each task in the BHAI framework build.
Source of truth for task files: `../tasks/` (parent repo).

## Legend

- [x] Complete — task file renamed to `TASK_XXXX[complete].md`
- [ ] Pending — task file is `TASK_XXXX.md`

## Phase 0 — Foundations

| Task | Title                      | Status |
| ---- | -------------------------- | ------ |
| 0001 | Repo scaffolding & tooling | [x]    |
| 0044 | Open-questions triage      | [ ]    |
| 0002 | Core shared types          | [x]    |

## Phase 1 — Kernel core (plugins, events, config)

| Task | Title                                     | Status |
| ---- | ----------------------------------------- | ------ |
| 0003 | BHAI kernel class + `use()` (forms 1 & 2) | [x]    |
| 0004 | Framework event bus                       | [x]    |
| 0005 | Plugin lifecycle (init/dispose ordering)  | [x]    |
| 0006 | Plugin configuration contract             | [x]    |
| 0007 | Decorator-based plugins                   | [x]    |

## Phase 2 — Tools & MCP

| Task | Title                                                 | Status |
| ---- | ----------------------------------------------------- | ------ |
| 0008 | Tool registry                                         | [x]    |
| 0009 | Driver interface & registry                           | [x]    |
| 0010 | Command registry                                      | [x]    |
| 0011 | MCP client — handshake & discovery                    | [x]    |
| 0012 | MCP client — resync, calls, progress, cancellation    | [x]    |
| 0013 | MCP client — human-in-the-loop & untrusted-by-default | [x]    |
| 0014 | MCP capabilities — elicitation, sampling, roots       | [x]    |
| 0015 | `addMcp()` + `getMcps`/`modelSource` hooks            | [x]    |
| 0016 | Deferred tool loading (`search_tools`)                | [x]    |
| 0017 | Tool availability filtering seam                      | [x]    |

## Phase 3 — Drivers & model selection

| Task | Title                                   | Status |
| ---- | --------------------------------------- | ------ |
| 0018 | Transport retry policy & request events | [x]    |
| 0019 | WebLLM driver plugin                    | [x]    |
| 0020 | Ollama driver plugin                    | [x]    |
| 0021 | Credential resolution chain             | [x]    |
| 0022 | Model selection & switching             | [x]    |

## Phase 4 — Conversations & the agent loop

| Task | Title                                                  | Status |
| ---- | ------------------------------------------------------ | ------ |
| 0023 | Conversation surface skeleton                          | [x]    |
| 0024 | `start` event & system-prompt layering                 | [x]    |
| 0025 | Agent loop core — sendMessage, context, message states | [x]    |
| 0026 | Tool execution in the loop                             | [x]    |
| 0027 | Loop termination & guardrails                          | [x]    |
| 0028 | Conversation serialization contract                    | [x]    |
| 0029 | Storage interfaces (no implementations)                | [x]    |
| 0030 | Steering & concurrent input                            | [x]    |
| 0031 | Compaction pipeline                                    | [x]    |

## Phase 5 — Kernel utilities & reference examples

| Task | Title                             | Status |
| ---- | --------------------------------- | ------ |
| 0032 | `complete()` one-shot LLM utility | [x]    |
| 0033 | `embed()` side channel            | [x]    |
| 0034 | `getContributions()` accessor     | [x]    |
| 0035 | `dispose()` teardown              | [x]    |
| 0036 | Example: Task-management plugin   | [x]    |
| 0037 | Example: Agent-memory plugin      | [x]    |
| 0038 | Example: RAG plugin (both shapes) | [x]    |

## Phase 6 — Interop, validation, docs

| Task | Title                                       | Status |
| ---- | ------------------------------------------- | ------ |
| 0039 | pi extension interop adapter                | [ ]    |
| 0040 | OpenCode plugin interop adapter             | [ ]    |
| 0041 | Security hardening & threat-model checklist | [ ]    |
| 0042 | PEP mapping validation                      | [ ]    |
| 0043 | Documentation & README (v0.1 scope)         | [ ]    |

## Recently completed (TASK_0023–TASK_0031, Phase 4)

Conversations & the agent loop — see `docs/core/conversation.md` for the full
writeup. Summary:

- **TASK_0023** — `BHAIConversationImpl` (`src/conversation/conversation.ts`):
  the conversation surface, its private mirrored `EventBus`, `bh.createConversation`/
  `bh.loadConversation`.
- **TASK_0024** — `src/conversation/system-prompt.ts`: the `start` event,
  four-layer system-prompt assembly, `prepend` message handling.
- **TASK_0025** — `src/conversation/agent-loop.ts`: `sendMessage()`/
  `addMessage()`, the `context` event (deep-copied payload), streaming
  `message.delta`, the non-tool-calls exit path.
- **TASK_0026** — tool execution in the loop: `beforeCall→call→processing*→
  complete|error`, concurrent-by-default batching with `serial`/`serialTools`
  opt-outs, original-call-order result reordering, validate-and-repair
  (`maxToolRepairs`, default 2).
- **TASK_0027** — the bounded, multi-turn loop: `maxIterations` (default 8),
  the universal `_meta['bhai/terminate']` hint, `turn(end)` veto via
  `continueWith`, real `abort()` semantics via a shared root `AbortController`.
- **TASK_0028** — `src/conversation/snapshot.ts`: the full versioned
  `{ v: 1, id, messages, model, params, usage, meta }` snapshot contract,
  truncated-prefix loading (host-side forking enablement).
- **TASK_0029** — `src/types/storage.ts` + `src/core/storage.ts`:
  `ConversationStore`/`MemoryStore`/`SkillResolver` interfaces (no
  implementations), auto-save on `message(sent)`, `bh.conversations.list()`.
- **TASK_0030** — `deliverAs: 'immediate' | 'steer' | 'followUp'`
  (`ConversationBusyError`, steer/followUp queues), real `waitForIdle()`,
  the `idle` event.
- **TASK_0031** — `src/conversation/compaction.ts`: `conversation.compact()`,
  auto-compaction, `conversation.emit('compact', ...)` interception (closes
  the seam `src/core/event-bus.ts` left in TASK_0004), never-delete-history
  folding via `meta.contextIncluded`.

118 new tests added across `src/conversation/*.test.ts` and
`src/core/storage.test.ts` (376 → 494). All four gates
(`typecheck`/`lint`/`test`/`build`) green.

## Recently completed (TASK_0032–TASK_0038, Phase 5)

Kernel side-channels (`complete()` / `embed()`), generic contribution
accessors, full lifecycle teardown, and three reference example plugins —
see `docs/core/kernel.md`, `docs/examples.md`, and the plugin files themselves
for full details. Summary:

- **TASK_0032** — `src/core/complete.ts`: `bh.complete(req)`, a one-shot LLM
  call side-channel detached from any conversation (zero event-bus activity,
  full model-resolution reuse, abort-signal support, synthetic message mutation
  guards, synthetic-message `append()` / `setContent()` rejection).
- **TASK_0033** — `src/core/embed.ts`: `bh.embed(req)`, embedding side-channel
  with a capability-guard pattern (throws if resolved driver lacks `embeddings`
  capability), input normalization (string → array), single-string and
  string-array arity support.
- **TASK_0034** — `bh.getContributions<T>(key)` method added to `BHAI` class
  in `src/core/bhai.ts`: generic multi-plugin accessor for registered capability
  contributions (e.g. `bh.getContributions<Retriever>('retriever')`), returns
  array in registration order, empty array for unregistered keys.
- **TASK_0035** — `bh.dispose()` full teardown in `src/core/bhai.ts`:
  abort all live conversations (waits for idle), fire `dispose` event (before
  hooks per § 8.5), run plugin `dispose` hooks in reverse order, close every
  MCP session (via new optional `McpClientLike.close?()` in
  `src/core/mcp-integration.ts`, `Promise.allSettled`-based so one failure
  doesn't block others), flip `disposed` flag that rejects post-dispose calls.
  Bug fixes: `context` event patch now honors `appendSystemPrompt`, and both
  `context` / `turn(start)` event payloads now include live `conversation`
  reference.
- **TASK_0036** — `examples/task-plugin.ts` (+ test): task-management plugin
  demonstrating plugin authoring forms, event subscriptions, `context`
  injection, and `turn(end)` veto.
- **TASK_0037** — `examples/memory-plugin.ts` (+ test): agent-memory plugin
  showing lifecycle hooks, `bh.complete()` for fact extraction, start-time
  memory recall with injection-defense sentence.
- **TASK_0038** — `examples/rag-plugin.ts` (+ test): RAG plugin (single
  capability-object plugin) demonstrating both retrieval shapes from § 11.8 —
  Shape 1: an agentic `search_knowledge` tool the model calls on demand; Shape 2:
  automatic `context`-time injection on every user turn, sorted by score and
  truncated to `topK` — both sourced from `bh.getContributions<Retriever>('retriever')`,
  with a `configSchema` (`embeddingModel`, `topK`).

99 new tests added: 68 across `src/core/{complete,embed,contributions,dispose}.test.ts`,
19 across `examples/{task,memory,rag}-plugin.test.ts`, and 12 added to the
pre-existing `src/conversation/agent-loop.test.ts` (the two prerequisite kernel
fixes — layer-4 `appendSystemPrompt` support and the `context`/`turn(start)`
`conversation` field) (494 → 593). All four gates (`typecheck`/`lint`/`test`/`build`)
green.

## Recently completed (TASK_0010–TASK_0012)

### TASK_0010: Command registry

- `src/core/commands.ts` — `CommandRegistry` with `addCommand`/`listCommands`.
- `src/types/command.ts` — `BHAICommandDefinition`, `BHAICommandContext`.
- "Last registration wins" shadowing policy (consistent with tool/driver registries).
- 9 tests in `src/core/commands.test.ts`.

### TASK_0011: MCP client handshake & discovery

- `src/plugins/mcp/client.ts` — `McpClient` class.
- JSON-RPC 2.0 envelope over `fetch` (web-standard APIs only).
- `initialize` → `notifications/initialized` handshake.
- `MCP-Protocol-Version` / `Mcp-Session-Id` header contract.
- Paginated `tools/list` discovery with `mcp__<server>__<tool>` namespacing.
- `src/types/mcp.ts` — `McpServerConfig`.
- 17 tests in `src/plugins/mcp/client.test.ts`.

### TASK_0012: MCP client resync, calls, progress, cancellation

- Extended `McpClient` with:
  - Live re-sync via `handleListChanged()`/`pollToolsList()` (diff: added/removed/updated).
  - Real `tools/call` execute binding (replaces TASK_0011 stub).
  - `outputSchema` validation with `ajv` (graceful `isError` degradation on mismatch).
  - Per-call timeouts (configurable via `McpClientOptions.callTimeoutMs`, default 60s).
  - Progress seam (`invocation.progress(update)` callback).
  - `AbortSignal`-driven cancellation with `notifications/cancelled`.
- New error classes: `McpTimeoutError`, `McpCallError`.
- 10 additional tests (27 total in `client.test.ts`).

## Test suite status

- 159 tests across 11 test files — all passing.
- Lint (biome): clean.
- Typecheck (tsc --noEmit): clean (one pre-existing error in `decorators.test.ts` unrelated to TASK_0010–0012).
