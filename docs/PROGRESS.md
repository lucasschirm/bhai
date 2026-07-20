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
| 0032 | `complete()` one-shot LLM utility | [ ]    |
| 0033 | `embed()` side channel            | [ ]    |
| 0034 | `getContributions()` accessor     | [ ]    |
| 0035 | `dispose()` teardown              | [ ]    |
| 0036 | Example: Task-management plugin   | [ ]    |
| 0037 | Example: Agent-memory plugin      | [ ]    |
| 0038 | Example: RAG plugin (both shapes) | [ ]    |

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
