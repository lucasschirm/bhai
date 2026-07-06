# BHAI Architecture (implementation view)

This document describes the **implemented** architecture of `@lucasschirm/bhai`
as of the current build state. For the full design proposal, see the parent
repo's `ARCHITECTURE.md`.

## Package layout

```
@lucasschirm/bhai              # root superset barrel (re-exports only)
@lucasschirm/bhai/core         # kernel only (BHAI, Conversation, types, events)
@lucasschirm/bhai/plugins/mcp  # MCP streamable-HTTP client plugin
@lucasschirm/bhai/plugins/*    # webllm, ollama, interop/*
```

Three tiers of entry point (see `.claude/rules/packaging.md`):

1. **Root `.`** — batteries-included superset. Re-exports core + every plugin.
2. **`./core`** — the kernel only. Minimal surface, zero plugin code.
3. **`./plugins/*`** — one entry per plugin, each independently importable.

## Source structure

```
src/
  index.ts                      # root superset barrel (re-exports only)
  core/
    bhai.ts                     # BHAI class (§ 6)
    event-bus.ts                # EventBus (§ 8)
    decorators.ts               # @Plugin, @On, @Tool (§ 7.2)
    drivers.ts                  # DriverRegistry (§ 10.1)
    commands.ts                 # CommandRegistry (§ 6)
    lifecycle.ts                # init/dispose ordering (§ 7.3)
    config.ts                   # plugin config contract (§ 7.4)
    index.ts                    # core barrel
  types/
    index.ts                    # types barrel
    content.ts                  # JSONSchema, ContentBlock, CallToolResult
    message.ts                  # BHAIMessage, ConversationStatus
    model.ts                    # DriverCapabilities, ModelInfo, Usage
    driver.ts                   # BHAIDriver, DriverEvent, ChatRequest
    events.ts                   # EmitResult, Unsubscribe
    tool.ts                     # BHAIToolDefinition, ToolInvocation
    command.ts                  # BHAICommandDefinition, BHAICommandContext
    mcp.ts                      # McpServerConfig
  tools/
    registry.ts                 # ToolRegistry (§ 9.2)
  plugins/
    mcp/
      client.ts                 # McpClient (§ 9.3)
      index.ts                  # plugin subpath entry
    webllm/                     # WebLLM driver plugin (TASK_0019)
    ollama/                     # stub (TASK_0020)
    interop/
      pi/                       # stub (future)
      opencode/                 # stub (future)
```

## Implemented subsystems

### Kernel (`src/core/`)

- **BHAI class** (`bhai.ts`): `use()`, `on()`/`emit()`, `init()`/`dispose()`,
  `declareConfig`/`setConfig`/`getConfig`, `addTool`/`removeTool`/`listTools`,
  `addDriver`/`listModels`, `addCommand`/`listCommands`. See
  `core/kernel.md`.
- **EventBus** (`event-bus.ts`): sequential awaited dispatch, patch chaining,
  blockable pipelines, reserved-namespace enforcement, global FIFO. See
  `core/event-bus.md`.
- **Decorators** (`decorators.ts`): TC39 stage-3 `@Plugin`, `@On`, `@Tool`.
  See `core/plugins.md`.
- **DriverRegistry** (`drivers.ts`): driver storage, `listModels()` merge,
  `driver.registered` events. See `core/drivers.md`.
- **CommandRegistry** (`commands.ts`): command storage, "last wins" shadowing.
  See `core/command-registry.md`.
- **Lifecycle** (`lifecycle.ts`): init/dispose ordering. See
  `core/plugins.md`.
- **Config** (`config.ts`): `ajv`-based plugin config validation. See
  `core/plugins.md`.
- **Retry** (`retry.ts`): transport retry policy & request lifecycle events
  (`callDriverWithRetry`, `isRetriableError`, `DEFAULT_RETRY_POLICY`). See
  `core/retry.md`.
- **Credentials** (`credentials.ts`): three-tier credential resolution chain
  (§ 10.4) — runtime value → `auth` hooks → unauthenticated. `resolveCredentials`,
  `CredentialResolver`, `CredentialScope`, `Credentials`. See
  `core/credentials.md`.
- **Models** (`models.ts`): model selection & switching (§ 10.5) —
  `parseModelRef`, `resolveModelRef` (bare-id disambiguation), `listModels`
  (catalogue merge), `resolveConversationModel` (four-tier resolution),
  `setModel` (deferred switching + `model.changed` event). Error types:
  `AmbiguousModelError`, `ModelNotFoundError`, `NoModelError`,
  `ModelUnavailableError`. See `core/models.md`.

### Shared types (`src/types/`)

- Cross-cutting type declarations (no runtime logic). See
  `core/types.md`.

### Tools (`src/tools/`)

- **ToolRegistry** (`registry.ts`): single source of truth for all tools.
  Shadowing (replace, no `tool.removed`), `tool.registered`/`tool.removed`
  events. Origin-agnostic (local vs. MCP invisible here). See
  `core/tool-registry.md`.

### MCP client (`src/plugins/mcp/`)

- **McpClient** (`client.ts`): streamable-HTTP JSON-RPC 2.0 client.
  Handshake, paginated discovery, live re-sync, `tools/call` proxy,
  `outputSchema` validation, timeouts, progress seam, cancellation.
  See `plugins/mcp-client.md` for full details.

### WebLLM driver (`src/plugins/webllm/`)

- **WebLLM** (`index.ts`): `BHAIDriver` implementation wrapping an injected
  MLC `MLCEngine` instance. Browser/WebGPU-only. Constructor-injection or
  pre-warmed-instance forms. Lazy model loading, `driver.progress` events,
  OpenAI-compatible streaming translation. See `plugins/webllm-driver.md`.

### Ollama driver (`src/plugins/ollama/`)

- **Ollama** (`index.ts`): `BHAIDriver` implementation backed entirely by
  web-standard `fetch`. NDJSON streaming from `POST /api/chat`,
  `listModels()` from `GET /api/tags`, `capabilities()` from cached
  `GET /api/show` (conservative defaults on missing fields), `embed()`
  from `POST /api/embed`. Works in any fetch-capable runtime. No peer
  dependency. See `plugins/ollama-driver.md`.

## Environment boundary

Web-standard APIs only in `src/core/` and `src/types/`:
`fetch`, `AbortController`, `ReadableStream`, `crypto.randomUUID`,
`structuredClone`, `queueMicrotask`. No Node built-ins, no DOM.

`ajv` is the only runtime dependency (pure-JS JSON Schema validator, used by
config validation and MCP `outputSchema` validation).

## Test infrastructure

- **Vitest** — test runner. Tests co-located with implementation
  (`<name>.test.ts` next to `<name>.ts`).
- **Biome** — linter + formatter.
- **tsc --noEmit** — typecheck.

### Commands

```bash
pnpm test          # run all tests
pnpm test <path>   # run a single test file
pnpm typecheck     # tsc --noEmit
pnpm lint          # biome check .
pnpm build         # tsup build
```

See `getting-started.md` for the full scaffolding/tooling reference
(package layout, subpath exports, tsconfig choices, dependency policy).

## Per-subsystem documentation

| Subsystem                                            | Doc                        |
| ---------------------------------------------------- | -------------------------- |
| Scaffolding & tooling                                | `getting-started.md`       |
| Kernel (`BHAI` class)                                | `core/kernel.md`           |
| Event bus                                            | `core/event-bus.md`        |
| Plugin system (forms, lifecycle, config, decorators) | `core/plugins.md`          |
| Shared types                                         | `core/types.md`            |
| Tool registry                                        | `core/tool-registry.md`    |
| Driver registry                                      | `core/drivers.md`          |
| Command registry                                     | `core/command-registry.md` |
| Credential resolution                                | `core/credentials.md`      |
| Model selection & switching                          | `core/models.md`           |
| MCP client                                           | `plugins/mcp-client.md`    |
| WebLLM driver                                        | `plugins/webllm-driver.md` |
| Ollama driver                                        | `plugins/ollama-driver.md` |
