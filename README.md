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

| Subpath | Description |
|---|---|
| `@lucasschirm/bhai` | Root superset — re-exports core + every plugin. |
| `@lucasschirm/bhai/core` | Kernel only (`BHAI`, `Conversation`, types, decorators, event bus). |
| `@lucasschirm/bhai/plugins/mcp` | MCP streamable-HTTP client plugin. |
| `@lucasschirm/bhai/plugins/webllm` | WebLLM driver plugin (planned). |
| `@lucasschirm/bhai/plugins/ollama` | Ollama driver plugin (planned). |

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
          content: [{ type: "text", text: `Hello, ${invocation.params.name}!` }],
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
  (`on`/`emit`), conversation lifecycle, tool/driver/command registries.
- **Plugin system** — every plugin normalizes to `{ name, setup(bh) }`. Three
  authoring styles: bare factory function, capability object, or
  `@Plugin`/`@On`/`@Tool` decorated class (TC39 stage-3 decorators).
- **Event model** — dot-namespaced, two buses (framework `bh.on`,
  per-conversation `conversation.on`), patch chaining, blockable pipelines.
- **Tools** — a BHAI tool definition *is* an MCP `Tool` object plus a local
  `execute` binding; results *are* MCP `CallToolResult`s. Local and remote
  MCP tools share one registry.
- **Drivers** — `BHAIDriver` interface (`listModels`, `capabilities`, `chat`).
  Two bundled (planned): WebLLM (browser/WebGPU) and Ollama (plain fetch).
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
  core/                         # kernel (BHAI, EventBus, decorators, registries)
  types/                        # shared type declarations (no runtime logic)
  tools/                        # tool registry
  plugins/
    mcp/                        # MCP streamable-HTTP client (implemented)
    webllm/                     # WebLLM driver (planned)
    ollama/                     # Ollama driver (planned)
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
- `docs/core/command-registry.md` — command registry docs.
- `docs/plugins/mcp-client.md` — MCP client docs.
- `../ARCHITECTURE.md` (parent repo) — full v0.1 design proposal.
- `../tasks/` (parent repo) — task breakdown (44 tasks).

## License

MIT
