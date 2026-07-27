# BHAI Kernel (`src/core/bhai.ts`)

Documentation for the `BHAI` kernel class — the framework entry point every
host instantiates and every plugin registers onto. Architecture reference:
ARCHITECTURE.md § 6.

## Overview

`BHAI` is the single class a host constructs. It owns:

1. **Plugin registration** via `use()` (TASK_0003) — normalizes the three
   accepted plugin forms (factory function, capability object, decorated
   class instance) into one canonical internal `BHAIPlugin` shape
   `{ name, setup(bh), capabilities? }`.
2. **The framework event bus** (TASK_0004) exposed as `on()`/`emit()`.
3. **Plugin lifecycle** (TASK_0005): `init()` runs every plugin's
   `initialize` hook in registration order and fires the `initialize`
   framework event; `dispose()` runs `dispose` hooks in reverse order and
   fires `dispose`. (Full teardown semantics are TASK_0035's job; this is
   the partial lifecycle implementation.)
4. **Plugin configuration** (TASK_0006): `declareConfig`/`setConfig`/`getConfig`
   with `ajv`-based JSON Schema validation and defaulting during `init()`,
   plus `config.changed` event emission for post-init updates.
5. **Tool registry** wiring (TASK_0008): `addTool`/`removeTool`/`listTools`.
6. **Driver registry** wiring (TASK_0009): `addDriver`/`listModels`.
7. **Command registry** wiring (TASK_0010): `addCommand`/`listCommands`.

Every other § 6 method (`createConversation`, `loadConversation`, `complete`,
`embed`, `addMcp`, full `dispose`) is currently a stub that throws with a
`TODO(TASK_XXXX)` comment naming the owning task, so accidental use surfaces
immediately rather than silently no-op'ing.

## Public API

```typescript
import { BHAI, type BHAIHostOptions } from "@lucasschirm/bhai";

const bh = new BHAI({ defaultModel: "webllm/Llama-3.2-3B" });

bh.use(myFactoryPlugin);          // form 1: bare factory function
bh.use({ name: "cap", tools: [] }); // form 2: capability object
bh.use(myDecoratedPluginInstance); // form 3: @Plugin-decorated class instance

await bh.init();
// ... use bh ...
await bh.dispose();
```

### Constructor: `BHAIHostOptions`

- `config?: Record<string, Record<string, unknown>>` — per-plugin config
  values keyed by plugin name (§ 7.4). Equivalent to calling `setConfig`
  before `init()`.
- `defaultModel?: string` — qualified `'<driver>/<model>'` ref. Wired up
  by TASK_0009 / TASK_0023.
- `systemPrompt?: string` — base system prompt injected into conversation
  preambles (TASK_0023 / § 11.6).

### `use(plugin: BHAIPluginLike): this`

Accepts one of three forms and normalizes it to the canonical
`BHAIPlugin` shape:

- **Form 1 — factory function** (`(bh) => void | Promise<void>`): the
  function IS the plugin's `setup`; runs immediately at `use()` time.
- **Form 2 — capability object**: a plain object with well-known keys
  (`name`, `initialize`, `dispose`, `modelSource`, `getMcps`, `tools`,
  `commands`, `configSchema`, `auth`, `retriever`, `skillResolver`,
  `conversationStore`, `memoryStore`). Keys outside this allowlist are
  rejected synchronously so typos like `initalize` fail fast.
- **Form 3 — `@Plugin`-decorated class instance** (added by TASK_0007):
  detected at runtime via a `BHAI_PLUGIN_META` symbol stamped by the
  `@Plugin` decorator, not by structural typing.

Duplicate `use()` calls with the same plugin name are ignored. Returns
`this` for chaining.

### Event surface: `on()` / `emit()`

Backed by an internal `EventBus` instance (see `event-bus.md`). The public
`emit()` enforces the reserved-namespace list (§ 8.4); the kernel uses an
internal `dispatch()` bypass to fire reserved events like `initialize`,
`dispose`, `error`, `config.changed`, `tool.registered`, `tool.removed`,
`driver.registered`.

### Lifecycle: `init()` / `dispose()`

- `init(): Promise<void>` — runs each capability-object plugin's
  `initialize` hook in **registration order**, fires the `initialize`
  framework event, then runs config validation/defaulting (TASK_0006).
- `dispose(): Promise<void>` — runs each plugin's `dispose` hook in
  **reverse registration order** and fires the `dispose` event. This is
  the partial lifecycle dispose; full teardown semantics land in
  TASK_0035.

### Config: `declareConfig` / `setConfig` / `getConfig`

- `declareConfig(pluginName, schema: JSONSchema)` — declares a plugin's
  config schema. Typically called from inside a plugin's `setup()`.
- `setConfig(pluginName, values)` — sets/merges config values. Pre-init
  calls accumulate initial values; post-init calls fire `config.changed`.
- `getConfig(pluginName)` — returns the merged (host-supplied + defaulted)
  config for a plugin. Validates against the declared schema during
  `init()` using `ajv`.

### Tools: `addTool` / `removeTool` / `listTools`

See `tools.md`. Two `addTool` overloads: full `BHAIToolDefinition` form
and a sugar form `addTool(name, parameters, execute)` (description
defaults to `''`).

### Drivers: `addDriver` / `listModels`

See `drivers.md`. `listModels()` merges catalogues from every registered
driver in parallel.

### Commands: `addCommand` / `listCommands`

See `command-registry.md`.

## Environment boundary

`bhai.ts` uses only web-standard APIs (`crypto.randomUUID()`). `ajv` is
the only runtime dependency in `src/core/` — a pure-JS JSON Schema
validator with no environment-specific bindings.

## Test coverage

21 tests in `src/core/bhai.test.ts`:

- Constructor + host-options storage.
- `use()` form 1 (factory) and form 2 (capability object) normalization.
- Capability-key allowlist enforcement (unknown keys rejected).
- Duplicate-name de-duplication.
- `on()`/`emit()` wiring (delegates to `EventBus`).
- `init()`/`dispose()` ordering (delegates to lifecycle module).
- Config declare/set/get round-trip.
- `addTool`/`addDriver`/`addCommand` delegation to their registries.
- Stub methods throw with the owning task's ID.
- Internal test accessors (`__testPluginCount`, `__testHasPlugin`,
  `__testOption`) for invariant assertions.
