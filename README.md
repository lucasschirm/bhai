# `@lucasschirm/bhai`

> Browser-Hosted Agentic AI Framework — a standalone, environment-agnostic
> TypeScript package that extracts agent-harness internals (provider gateway,
> tool-calling loop, conversation persistence, streaming, memory, MCP client)
> into a plugin-first framework.

## Status

Pre-v0.1. Active implementation in progress — see `docs/PROGRESS.md` for the
current task completion status.

## Installation

```bash
pnpm add @lucasschirm/bhai
```

## Package layout

Three tiers of entry point let consumers load only what they need:

| Subpath                            | Description                                                         |
| ---------------------------------- | ------------------------------------------------------------------- |
| `@lucasschirm/bhai`                | Root superset — re-exports core + every plugin.                     |
| `@lucasschirm/bhai/core`           | Kernel only (`BHAI`, `BHAIConversation`, types, decorators, event bus). |
| `@lucasschirm/bhai/plugins/mcp`    | MCP streamable-HTTP client plugin.                                  |
| `@lucasschirm/bhai/plugins/webllm` | WebLLM driver plugin (browser/WebGPU).                              |
| `@lucasschirm/bhai/plugins/ollama` | Ollama driver plugin (plain `fetch`).                                |
| `@lucasschirm/bhai/plugins/interop/pi` | pi coding-agent extension adapter (planned).                    |
| `@lucasschirm/bhai/plugins/interop/opencode` | OpenCode plugin adapter (planned).                         |

## Quick start

```typescript
import { BHAI } from "@lucasschirm/bhai";

const bh = new BHAI();

// Register a plugin
bh.use({
  name: "my-plugin",
  setup(bh) {
    bh.addTool({
      name: "greet",
      description: "Greet someone",
      inputSchema: { type: "object", properties: { name: { type: "string" } } },
      execute: async (invocation) => {
        return {
          content: [
            { type: "text", text: `Hello, ${invocation.params.name}!` },
          ],
          isError: false,
        };
      },
    });
  },
});

await bh.init();
```

## Core concepts

- **Kernel (`BHAI` class)** — owns plugin registration (`use`), the event bus
  (`on`/`emit`), conversation lifecycle (`createConversation`/
  `loadConversation`), tool/driver/command registries.
- **Plugin system** — every plugin normalizes to `{ name, setup(bh) }`. Three
  authoring styles: bare factory function, capability object, or
  `@Plugin`/`@On`/`@Tool` decorated class (TC39 stage-3 decorators).
- **Event model** — dot-namespaced, two buses (framework `bh.on`,
  per-conversation `conversation.on`, transparently mirrored as
  `conversation.<event>`), patch chaining, blockable pipelines.
- **Conversations & the agent loop** — `conversation.sendMessage()` drives a
  bounded (`maxIterations`, default 8), tool-calling loop: system-prompt
  layering, the `context` event, concurrent-by-default tool execution with
  validate-and-repair, `deliverAs: 'immediate' | 'steer' | 'followUp'`
  steering, opt-in context-window compaction, and a versioned
  `toJSON()`/`loadConversation()` snapshot contract. See
  `docs/core/conversation.md`.
- **Tools** — a BHAI tool definition _is_ an MCP `Tool` object plus a local
  `execute` binding; results _are_ MCP `CallToolResult`s. Local and remote
  MCP tools share one registry.
- **Drivers** — `BHAIDriver` interface (`listModels`, `capabilities`, `chat`).
  Two bundled: WebLLM (browser/WebGPU) and Ollama (plain `fetch`).
- **MCP client** — streamable-HTTP transport only (spec rev 2025-11-25).
  Handles handshake, paginated discovery, live re-sync, progress/cancellation.

## Environment boundary

Web-standard APIs only in the core: `fetch`, `AbortController`,
`ReadableStream`, `crypto.randomUUID`, `structuredClone`, `queueMicrotask`.
No Node built-ins, no DOM. Anything environment-specific (WebGPU, stdio)
lives in a driver/plugin subpath.

## Project structure

```
src/
  index.ts                      # root superset barrel
  core/                         # kernel (BHAI, EventBus, decorators, registries, storage wiring)
  conversation/                 # BHAIConversation, the agent loop, compaction, snapshots
  types/                        # shared type declarations (no runtime logic)
  tools/                        # tool registry, availability filtering
  plugins/
    mcp/                        # MCP streamable-HTTP client (implemented)
    webllm/                     # WebLLM driver (implemented)
    ollama/                     # Ollama driver (implemented)
    interop/                    # interop adapters (planned)
docs/                           # implementation documentation
```

## Development

```bash
pnpm install          # install dependencies
pnpm test             # run all tests (vitest)
pnpm test <path>      # run a single test file
pnpm typecheck        # tsc --noEmit
pnpm lint             # biome check .
pnpm build            # tsup build
```

## Documentation

- `docs/ARCHITECTURE.md` — implemented architecture overview.
- `docs/PROGRESS.md` — task completion status.
- `docs/core/kernel.md` — the `BHAI` kernel class.
- `docs/core/conversation.md` — conversations & the agent loop (Phase 4).
- `docs/core/event-bus.md`, `docs/core/tool-registry.md`,
  `docs/core/command-registry.md`, `docs/core/drivers.md`,
  `docs/core/models.md`, `docs/core/credentials.md`, `docs/core/plugins.md`,
  `docs/core/types.md` — kernel subsystem docs.
- `docs/plugins/mcp-client.md`, `docs/plugins/webllm-driver.md`,
  `docs/plugins/ollama-driver.md` — bundled plugin docs.
- `../ARCHITECTURE.md` (parent repo) — full v0.1 design proposal.
- `../tasks/` (parent repo) — task breakdown (44 tasks).

## License

MIT
