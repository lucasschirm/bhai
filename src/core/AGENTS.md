# `src/core/` — BHAI kernel

## Purpose & scope
The kernel: the `BHAI` class (framework entry point, ARCHITECTURE.md § 6), the event bus (§ 8), plugin normalization + decorators (§ 7), plugin config (§ 7.4), lifecycle (§ 7.3), and the driver registry (§ 10.1). Everything a host instantiates and every plugin registers onto lives here. Web-standard APIs only (§ 5) — no Node built-ins, no DOM, no imports from `src/plugins/**`.

## Key files
- `bhai.ts` — the `BHAI` class. Constructor + `use()` (TASK_0003), `on()`/`emit()` (TASK_0004), `init()`/`dispose()` (TASK_0005), `declareConfig`/`setConfig`/`getConfig` (TASK_0006), `addTool`/`removeTool`/`listTools` (TASK_0008), `addDriver`/`listModels` (TASK_0009). Stubs for not-yet-implemented § 6 methods throw with a `TODO(TASK_XXXX)` comment naming the owner.
- `event-bus.ts` — `EventBus` class (§ 8). Sequential awaited dispatch, patch chaining, blockable pipelines, reserved-namespace enforcement on public `emit()`, internal `dispatch()` bypass for kernel-originated events, global per-bus FIFO serialization.
- `decorators.ts` — TC39 stage-3 decorators (`@Plugin`, `@On`, `@Tool`) for plugin form 3 (§ 7.2). Native decorators only — no `experimentalDecorators`.
- `drivers.ts` — `DriverRegistry` (TASK_0009, § 10.1). Stores `BHAIDriver` instances keyed by `id`, fires `driver.registered`, merges `listModels()` across drivers. `modelSource` hook merge is TASK_0015's job (see seam comment).
- `index.ts` — core barrel. Re-exports the public kernel surface.

## Conventions
- **Stubs throw, never no-op**: an unimplemented § 6 method throws with `Error("bh.<method>(): not implemented — see TASK_XXXX")` so accidental use surfaces immediately.
- **`ajv` is the only runtime dep** in this directory (config validation, TASK_0006). It's pure-JS with no environment bindings.
- **Test accessors** (`__testPluginCount`, `__testHasPlugin`, `__testOption`) exist for kernel-internal invariant assertions; they are `@internal` and not part of § 6.
- **PATH NOTE**: TASK specs say `src/kernel/`, but the repo convention is `src/core/` (established by TASK_0002). New kernel files go here, not in a separate `kernel/` dir.

## Consumers
- `src/index.ts` re-exports `core/index.ts` as the `.` and `./core` subpath entries.
- `src/tools/registry.ts` imports `EventBus` from here (the tool registry fires `tool.registered`/`tool.removed` via the bus's kernel bypass).
- Plugin authors import `BHAI`, `Plugin`, `On`, `Tool`, `EventBus` from `@lucasschirm/bhai` or `@lucasschirm/bhai/core`.
