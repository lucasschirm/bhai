# Plugin System (`src/core/bhai.ts`, `src/core/decorators.ts`, `src/core/lifecycle.ts`, `src/core/config.ts`)

Documentation for BHAI's plugin model: the three accepted authoring forms,
the canonical normalization contract, lifecycle ordering, the config
contract, and the TC39 stage-3 decorator form. Architecture reference:
ARCHITECTURE.md § 7.

## The canonical contract (§ 7.1)

Every plugin form normalizes to one internal shape:

```typescript
interface BHAIPlugin {
  name: string;
  setup(bh: BHAI): void | Promise<void>;
  capabilities?: BHAIPluginCapabilities; // form 2 only
}
```

The rest of the kernel only ever sees this interface, so it never needs
to special-case which form a plugin arrived in. `setup` runs immediately
at `use()` time; registrations made during `setup` are tracked per plugin
so a future `dispose()` (TASK_0035) can unwind them.

## The three accepted forms (§ 7.2)

### Form 1 — bare factory function (pi style)

```typescript
bh.use((bh) => {
  bh.addTool("greet", { type: "object", properties: {} }, async () => "hi");
});
```

The function IS the plugin's `setup`. It runs immediately at `use()` time,
receives the `BHAI` instance, and registers whatever capabilities it
needs by calling kernel methods on that instance. The plugin name is
derived from the function's `name` property (or `"anonymous"` if absent).

### Form 2 — capability object (OpenCode style)

```typescript
bh.use({
  name: "my-plugin",
  initialize: ({ bh }) => { /* ... */ },
  dispose: ({ bh }) => { /* ... */ },
  tools: [/* BHAIToolDefinition[] */],
  commands: { /* Record<string, BHAICommandDefinition> */ },
  configSchema: { type: "object", properties: { /* ... */ } },
  modelSource: async () => [/* ModelInfo[] */],
});
```

Well-known capability keys (allowlist — any other key is rejected
synchronously at `use()` time so typos like `initalize` fail fast):

| Key | Owner | Purpose |
|---|---|---|
| `name` | — | plugin name (required in practice) |
| `initialize` | TASK_0005 | runs during `bh.init()` |
| `dispose` | TASK_0005 | runs during `bh.dispose()` |
| `modelSource` | TASK_0015 | contributes `ModelInfo[]` to `listModels()` |
| `getMcps` | TASK_0015 | returns `McpServerConfig[]` to attach |
| `tools` | TASK_0008 | `BHAIToolDefinition[]` registered at `use()` time |
| `commands` | TASK_0010 | `Record<string, BHAICommandDefinition>` |
| `configSchema` | TASK_0006 | declares the plugin's config schema |
| `auth` | TASK_0015 / § 10.4 | credential resolution hook |
| `retriever` | future (§ 11.8) | RAG retrieval hook |
| `skillResolver` | future (§ 11.4) | skill resolution hook |
| `conversationStore` | future (§ 11.4) | conversation persistence |
| `memoryStore` | future (§ 11.4) | memory persistence |

### Form 3 — `@Plugin`-decorated class (VS Code style, TASK_0007)

```typescript
@Plugin("task-list")
class TaskListPlugin {
  @On("initialize")
  onStart({ bh }) { /* ... */ }

  @Tool("task_add", { type: "object", properties: { /* ... */ } })
  addTask(invocation) { /* ... */ }
}

bh.use(new TaskListPlugin());
```

Uses **TC39 stage-3 native decorators** only — NOT `experimentalDecorators`.
`tsconfig.json` does not set `experimentalDecorators` or
`emitDecoratorMetadata`. The `@Plugin` decorator stamps a
`BHAI_PLUGIN_META` symbol on the class; `use()` detects form-3 instances
by reading that symbol at runtime (not by structural typing).

Decorators:

- `@Plugin(name?)` — marks a class as a BHAI plugin. The decorated class
  must satisfy the empty marker interface `BHPlugin`.
- `@On(event)` — registers a method as an event handler on the framework
  bus. Runs during `setup()`.
- `@Tool(name, inputSchema)` — registers a method as a tool. The method
  becomes the tool's `execute` binding.

## Lifecycle (§ 7.3, TASK_0005)

- `bh.init()` runs every capability-object plugin's `initialize` hook in
  **registration order**, then fires the `initialize` framework event,
  then runs config validation/defaulting (TASK_0006).
- `bh.dispose()` runs every plugin's `dispose` hook in **reverse
  registration order** and fires the `dispose` framework event. This is
  the partial lifecycle dispose; full teardown semantics (unwinding
  per-plugin registrations) land in TASK_0035.

## Config contract (§ 7.4, TASK_0006)

A plugin declares its config schema with `bh.declareConfig(name, schema)`
(typically from inside `setup()`). The host supplies values via the
constructor's `config` option or via `bh.setConfig(name, values)`. During
`init()`, `ajv` validates each plugin's merged (host-supplied + defaulted)
config against its declared schema; validation failures throw.

Post-init `setConfig()` calls fire the `config.changed` framework event
with `{ pluginName, values }`. Pre-init calls merely accumulate initial
values and do not constitute a "change" to a live config.

`bh.getConfig(name)` returns the merged config for a plugin.

## Environment boundary

All files in this subsystem use only web-standard APIs. `ajv` is the only
runtime dependency (config validation) — pure-JS, no environment bindings.
Decorators rely on the TC39 stage-3 decorator runtime support in
TypeScript ≥ 5.0.

## Test coverage

- `src/core/bhai.test.ts` (21 tests) — `use()` normalization for forms 1
  & 2, capability-key allowlist, duplicate-name de-duplication.
- `src/core/decorators.test.ts` (6 tests) — `@Plugin`/`@On`/`@Tool` form
  3 detection and registration.
- `src/core/lifecycle.test.ts` (8 tests) — `init()`/`dispose()` ordering,
  `initialize`/`dispose` event firing.
- `src/core/config.test.ts` (9 tests) — `declareConfig`/`setConfig`/`getConfig`
  round-trip, `ajv` validation, defaulting, `config.changed` emission.
