# `bhai/` — `@lucasschirm/bhai` package

## Purpose & scope

The actual git repository for the `@lucasschirm/bhai` package (MIT license).
Contains the framework source (`src/`), build/test/lint tooling, and
implementation documentation (`docs/`). The parent directory holds only the
v0.1 design proposal (`ARCHITECTURE.md`) and the task breakdown (`tasks/`) —
all code lives here.

## Current state (TASK_0001–TASK_0012 complete)

Phase 0 (foundations), Phase 1 (kernel core), and the first three tasks of
Phase 2 (tool/driver/command registries + MCP client handshake/discovery/
calls) are implemented. See `docs/PROGRESS.md` for the full task status.

Implemented:

- **Scaffolding** (`package.json`, `tsconfig.json`, `tsup.config.ts`,
  `vitest.config.ts`, `biome.json`, `husky`) — ESM-only, three-tier subpath
  exports, native TC39 stage-3 decorators.
- **Kernel** (`src/core/bhai.ts`) — `BHAI` class: `use()`, `on()`/`emit()`,
  `init()`/`dispose()`, config contract, registry wiring.
- **Event bus** (`src/core/event-bus.ts`) — sequential dispatch, patch
  chaining, blockable pipelines, reserved-namespace enforcement.
- **Plugin system** (`src/core/decorators.ts`, `lifecycle.ts`, `config.ts`)
  — three forms (factory, capability object, decorated class), lifecycle
  ordering, `ajv`-based config validation.
- **Shared types** (`src/types/`) — pure type declarations, no runtime logic.
- **Tool registry** (`src/tools/registry.ts`) — single source of truth,
  shadowing, `tool.registered`/`tool.removed` events.
- **Driver registry** (`src/core/drivers.ts`) — `listModels()` merge across
  drivers.
- **Command registry** (`src/core/commands.ts`) — `addCommand`/`listCommands`.
- **MCP client** (`src/plugins/mcp/`) — streamable-HTTP JSON-RPC 2.0,
  handshake, discovery, re-sync, `tools/call`, validation, timeouts,
  progress, cancellation.

Not yet implemented: conversations/agent loop (Phase 4), concrete WebLLM/
Ollama drivers (TASK_0019/0020), `addMcp()` public entry (TASK_0015),
interop adapters (TASK_0039/0040), `complete()`/`embed()` (TASK_0032/0033).

## Key files

- `package.json` — package manifest, three-tier `exports`, scripts. See
  `.claude/rules/packaging.md`.
- `src/index.ts` — root superset barrel (re-exports `core/`, `types/`, and
  every `plugins/*` subpath).
- `src/core/bhai.ts` — the `BHAI` kernel class. See `docs/core/kernel.md`.
- `docs/` — implementation documentation. See `docs/ARCHITECTURE.md` for the
  index of per-subsystem docs.
- `tsup.config.ts` — multi-entry ESM build; entry list mirrors `package.json`
  `exports` 1:1.

## Conventions

- **All code is TypeScript.** Strict mode, ES2022, `moduleResolution:
  "Bundler"`, native TC39 stage-3 decorators (no `experimentalDecorators`).
- **Web-standard APIs only** in `src/core/` and `src/types/` — `fetch`,
  `AbortController`, `ReadableStream`, `crypto.randomUUID`,
  `structuredClone`, `queueMicrotask`. No Node built-ins, no DOM.
- **`ajv` is the only runtime dependency** in the core (config + MCP
  `outputSchema` validation). Heavy deps like `@mlc-ai/web-llm` are peer
  dependencies scoped to their plugin subpath, injected at runtime.
- **Tests co-located with code**: `<name>.test.ts` next to `<name>.ts`.
- **Stubs throw, never no-op**: unimplemented § 6 methods throw with a
  `TODO(TASK_XXXX)` comment naming the owning task.
- **Barrels use `.js` extensions** in re-exports for strict-Node-ESM
  compatibility of the shipped output.
- **Code comments follow JSDoc format.**

## Commands

```bash
pnpm install          # install dependencies
pnpm build            # tsup — multi-entry ESM build + .d.ts
pnpm typecheck        # tsc --noEmit
pnpm lint             # biome check .
pnpm format           # biome format --write .
pnpm test             # vitest run
pnpm test <path>      # run a single test file
pnpm test:watch       # vitest watch mode
```

## Consumers

- Downstream hosts (PEP, future WebLLM chat, CLI, Electron) import from the
  published package, not from `src/` directly.
- The parent repo's `tasks/` directory drives implementation order; this
  package's `docs/PROGRESS.md` tracks completion status.

## Rules

- `.claude/rules/packaging.md` — subpath exports, dependency policy,
  tree-shaking rules.
- `.claude/rules/workspace.md` — workspace structure (code in `bhai/`,
  tasks in `tasks/`).
- `.claude/rules/testing.md` — test conventions.
- `.claude/rules/docs.md` — keep documentation current with code changes.
