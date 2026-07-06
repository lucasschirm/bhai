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
| 0018 | Transport retry policy & request events | [ ]    |
| 0019 | WebLLM driver plugin                    | [ ]    |
| 0020 | Ollama driver plugin                    | [ ]    |
| 0021 | Credential resolution chain             | [ ]    |
| 0022 | Model selection & switching             | [ ]    |

## Phase 4 — Conversations & the agent loop

| Task | Title                                                  | Status |
| ---- | ------------------------------------------------------ | ------ |
| 0023 | Conversation surface skeleton                          | [ ]    |
| 0024 | `start` event & system-prompt layering                 | [ ]    |
| 0025 | Agent loop core — sendMessage, context, message states | [ ]    |
| 0026 | Tool execution in the loop                             | [ ]    |
| 0027 | Loop termination & guardrails                          | [ ]    |
| 0028 | Conversation serialization contract                    | [ ]    |
| 0029 | Storage interfaces (no implementations)                | [ ]    |
| 0030 | Steering & concurrent input                            | [ ]    |
| 0031 | Compaction pipeline                                    | [ ]    |

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

## Recently completed (TASK_0001–TASK_0012)

### TASK_0001: Repo scaffolding & tooling

- `package.json` — `@lucasschirm/bhai` 0.1.0, ESM-only, `sideEffects: false`,
  three-tier subpath exports, `pnpm` scripts (`build`, `typecheck`, `lint`,
  `format`, `test`, `test:watch`).
- `tsconfig.json` — strict, ES2022, `moduleResolution: "Bundler"`, native
  TC39 stage-3 decorators (no `experimentalDecorators`).
- `tsup.config.ts` — multi-entry ESM build with `.d.ts` bundling, entry
  list mirrors `package.json` `exports` 1:1.
- `vitest.config.ts`, `biome.json`, `husky` pre-commit hook.
- Empty source barrels: `src/index.ts`, `src/core/index.ts`, five plugin
  placeholder barrels under `src/plugins/**`.
- 1 smoke test in `src/index.test.ts`. See `getting-started.md`.

### TASK_0002: Core shared types

- `src/types/` — pure type declarations, no runtime logic.
- `content.ts` (`JSONSchema`, `ContentBlock`, `CallToolResult`),
  `message.ts` (`BHAIMessage`, `ConversationStatus`),
  `model.ts` (`ModelInfo`, `DriverCapabilities`, `Usage`),
  `driver.ts` (`GenerationParams`, `DriverEvent`, `ChatRequest`,
  `ToolWireDefinition`), `events.ts` (`EmitResult`, `Unsubscribe`).
- `types.test.ts` — compile-time type-assertion tests (10). See
  `core/types.md`.

### TASK_0003: BHAI kernel class + `use()` (forms 1 & 2)

- `src/core/bhai.ts` — `BHAI` class with constructor (`BHAIHostOptions`)
  and `use()` normalizing plugin forms 1 (factory function) and 2
  (capability object) into the canonical `BHAIPlugin` shape
  `{ name, setup(bh), capabilities? }`.
- Capability-key allowlist (`name`, `initialize`, `dispose`,
  `modelSource`, `getMcps`, `tools`, `commands`, `configSchema`, `auth`,
  `retriever`, `skillResolver`, `conversationStore`, `memoryStore`) —
  unknown keys rejected synchronously.
- Duplicate `use()` calls with the same name are ignored. Returns `this`.
- Every other § 6 method is a stub that throws with `TODO(TASK_XXXX)`.
- 21 tests in `src/core/bhai.test.ts`. See `core/kernel.md`.

### TASK_0004: Framework event bus

- `src/core/event-bus.ts` — standalone, reusable `EventBus` class.
- § 8.2's five handler-semantics rules: sequential awaited dispatch,
  patch chaining, blockable pipelines, error containment + rerouting to
  `error`, global per-bus FIFO serialization of re-entrant emissions.
- § 8.4 emission asymmetry: public `emit()` enforces reserved-namespace
  list; internal `dispatch()` bypass for kernel-originated events.
- `compact` is the one reserved name plugins may `emit()` (triggers
  compaction pipeline).
- Wired onto `BHAI` as `on()`/`emit()`.
- 29 tests in `src/core/event-bus.test.ts`. See `core/event-bus.md`.

### TASK_0005: Plugin lifecycle (init/dispose ordering)

- `bh.init()` runs each capability-object plugin's `initialize` hook in
  registration order, fires the `initialize` framework event.
- `bh.dispose()` runs each plugin's `dispose` hook in reverse
  registration order, fires the `dispose` event.
- Partial lifecycle dispose — full teardown semantics (unwinding
  per-plugin registrations) land in TASK_0035.
- 8 tests in `src/core/lifecycle.test.ts`. See `core/plugins.md`.

### TASK_0006: Plugin configuration contract

- `bh.declareConfig(name, schema)` / `bh.setConfig(name, values)` /
  `bh.getConfig(name)`.
- `ajv`-based JSON Schema validation and defaulting during `init()`.
  `ajv` is a retroactive runtime dependency addition (declared in
  `package.json` `dependencies`, not `devDependencies`).
- Post-init `setConfig()` calls fire the `config.changed` framework
  event with `{ pluginName, values }`. Pre-init calls accumulate.
- 9 tests in `src/core/config.test.ts`. See `core/plugins.md`.

### TASK_0007: Decorator-based plugins (form 3)

- `src/core/decorators.ts` — TC39 stage-3 native decorators `@Plugin`,
  `@On`, `@Tool` (no `experimentalDecorators`).
- `@Plugin(name?)` stamps a `BHAI_PLUGIN_META` symbol on the class;
  `use()` detects form-3 instances by reading that symbol at runtime.
- `@On(event)` registers a method as a framework-bus event handler.
- `@Tool(name, inputSchema)` registers a method as a tool (the method
  becomes the tool's `execute` binding).
- 6 tests in `src/core/decorators.test.ts`. See `core/plugins.md`.

### TASK_0008: Tool registry

- `src/tools/registry.ts` — `ToolRegistry` (single in-process source of
  truth for all tools, § 9.2 "one in-process MCP server").
- `addTool` two overloads: full `BHAIToolDefinition` form and sugar form
  `addTool(name, parameters, execute)` (description defaults to `''`).
- Name validation: 1–128 chars, `/^[a-zA-Z0-9_.-]+$/` (§ 9.1).
- Shadowing: re-registration replaces, fires `tool.registered` only
  (NOT `tool.removed`). `removeTool()` fires `tool.removed`.
- `normalizeToolResult()` — string returns wrapped as
  `{ content: [{ type: 'text', text }] }`.
- `src/types/tool.ts` — `BHAIToolDefinition`, `ToolInvocation`,
  `ToolExecute`, `ToolFilter`, `Icon`, `ToolAnnotations`, opaque
  `BHAIConversation` placeholder (added on TASK_0002's behalf).
- 26 tests in `src/tools/registry.test.ts`. See `core/tool-registry.md`.

### TASK_0009: Driver interface & registry

- `src/core/drivers.ts` — `DriverRegistry` storing `BHAIDriver`
  instances keyed by `id`.
- `addDriver(driver)` inserts/replaces, fires `driver.registered`.
- `listModels()` calls every registered driver's `listModels()` in
  parallel (`Promise.all`) and concatenates results into one flat
  array. Seam left for TASK_0015 to extend the merge with `modelSource`
  hook results.
- `src/types/driver.ts` — `BHAIDriver` interface (added on TASK_0002's
  behalf).
- 13 tests in `src/core/drivers.test.ts`. See `core/drivers.md`.

### TASK_0010: Command registry

- `src/core/commands.ts` — `CommandRegistry` with `addCommand`/`listCommands`.
- `src/types/command.ts` — `BHAICommandDefinition`, `BHAICommandContext`.
- "Last registration wins" shadowing policy (consistent with tool/driver registries).
- No events fired for command registration/replacement (no
  `command.registered` event in the spec).
- 9 tests in `src/core/commands.test.ts`. See `core/command-registry.md`.

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

### TASK_0013: MCP client — human-in-the-loop & untrusted-by-default

- `src/plugins/mcp/approval.ts` — `ApprovalGate` function type, `McpApprovalOptions`,
  `McpApprovalError`, and the `guardCall()` refusal-policy helper.
- Refusal policy: `autoApproveTools: true` short-circuits; no gate + no opt-out refuses
  with a clear error; gate present delegates and surfaces the reason on refusal.
- `McpServerConfig.trusted` flag added (default `false`); stored inertly and exposed via
  `McpClient.isTrusted()`. Consumed by TASK_0017's availability filtering, NOT by this
  task's own logic.
- `McpClient.callTool()` wraps the transport call in `guardCall()` — refusal happens
  before any `fetch` is attempted.
- 19 tests in `src/plugins/mcp/approval.test.ts`.

### TASK_0014: MCP capabilities — elicitation, sampling, roots

- `src/plugins/mcp/capabilities.ts` — `McpClientCapabilityOptions` (opt-in shape),
  `buildClientCapabilities()` (key-presence-based), and the three inbound request
  handlers (`handleElicitation`, `handleSampling`, `handleRootsList`).
- `initialize` handshake's `capabilities` object built conditionally — a key is
  included IFF its opt-in is present (entirely absent otherwise, per MCP semantics).
- Sampling reuses the TASK_0013 `ApprovalGate` verbatim (same "subscribed approver OR
  `autoApproveTools`" policy as tool calls).
- `McpClient.handleInboundRequest()` dispatches `elicitation/create`,
  `sampling/createMessage`, `roots/list`; `McpClient.notifyRootsChanged()` sends
  `notifications/roots/list_changed`.
- 37 tests in `src/plugins/mcp/capabilities.test.ts`.

### TASK_0015: `addMcp()` + `getMcps`/`modelSource` hooks

- `src/core/mcp-integration.ts` — `McpRegistry`, `McpHandle`, `McpClientFactory` seam,
  `resolveGetMcpsHooks()`, `resolveModelSourceHooks()`.
- `BHAI.addMcp()` implemented (replaces the stub); delegates to `McpRegistry`.
- `BHAI.init()` seam filled — resolves `getMcps` and `modelSource` hooks AFTER all
  `initialize` hooks run and BEFORE the `initialize` framework event fires (§ 8.5
  step 2). Fires `mcp.attached` per attach.
- `BHAI.listModels()` now merges driver registry + `modelSource` hook results.
- Packaging rule respected: `src/core/` never imports `src/plugins/mcp/` — the MCP
  plugin injects its `McpClient` constructor via `registerMcpClientFactory()`.
- 25 tests in `src/core/mcp-integration.test.ts`.

### TASK_0016: Deferred tool loading (`search_tools`)

- `src/plugins/mcp/deferred.ts` — `registerDeferredTools()`,
  `eagerRegisterAndAnswer()`, `DeferredMcpTool`, `DeferredContext`.
- When `deferred: true`, `McpClient.connect()` fetches `tools/list` (to cache) but
  registers only two synthetic tools: `mcp__<server>__list_tools` and
  `mcp__<server>__search_tools`.
- Calling either synthetic tool eagerly registers all cached real tools (registered
  live for the rest of the conversation); `search_tools` returns a keyword-filtered
  list (case-insensitive substring match on name + description).
- Purely client-side policy — no server support or protocol extension required.
- 13 tests in `src/plugins/mcp/deferred.test.ts`.

### TASK_0017: Tool availability filtering seam

- `src/tools/availability.ts` — `resolveAvailableTools()` (pure 3-step decision
  function), `applyToolFilter()`, `isToolTrusted()`, `ResolvedTool`.
- § 9.5 resolution order: (1) static `ToolFilter` (allow/deny, tags include/exclude),
  (2) `contextPatchedTools` (REPLACES step 1 output, not a merge), (3) driver-
  capability gating (`toolCalls: false` → empty array).
- Trust flag derived from `McpServerConfig.trusted` (TASK_0013) — local tools always
  trusted; `mcp__<server>__<tool>` tools trusted IFF server is in `trustedSources`.
- UNRESOLVED: "Prompt-injected tool fallback" (§ 9.5 step 3 parenthetical) explicitly
  flagged as not implemented — returns empty array; a future task (likely TASK_0026)
  will implement the prompt-injection path.
- 30 tests in `src/tools/availability.test.ts`.

## Test suite status

- 283 tests across 16 test files — all passing.
- Lint (biome): clean.
- Typecheck (tsc --noEmit): clean.
