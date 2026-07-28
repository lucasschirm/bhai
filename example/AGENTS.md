# `example/` — WebLLM chat browser example

## Purpose & scope

A no-framework, TypeScript browser example demonstrating BHAI's core capabilities:
streaming responses, in-browser model execution via WebLLM, live telemetry (decode/prefill tokens per second, time-to-first-token, context usage), framework-side parsing of reasoning blocks (`<think>...</think>` regions, via `parseThink: true`), and runtime attachment of HTTP MCP servers with live connection status, searchable tool discovery, and error inspection.

Consumes the WORKSPACE-LINKED, BUILT `dist/` output of `@lucasschirm/bhai` (via `workspace:*` dependency + `pnpm run build` running first), never source imports (`../../src/*.ts`). This ensures the example exercises the real published subpath exports, the real `.d.ts` output, and tree-shaking behavior.

## Current state

Complete. Browser layer is TypeScript, split into one module per DOM region (`src/components/`) plus per-feature orchestration (`src/app/`), with the MCP panel's lists backed by [List.js](https://listjs.com) through a single adapter.

## Key files

- **`package.json`** — `bhai-example` workspace member. Private. Depends on root `@lucasschirm/bhai` via `workspace:*`, `@mlc-ai/web-llm ^0.2.79`, and `list.js ^2.3.1` as production dependencies; `@types/list.js`, `@webgpu/types`, `happy-dom`, `typescript`, and `vite` as dev dependencies.
- **`tsconfig.json`** — Typechecks the example as its own project (`pnpm --filter bhai-example typecheck`, also covered by the root `pnpm typecheck`). Separate from the root config because it needs the DOM lib — which the kernel deliberately does not (ARCHITECTURE.md § 5) — and because resolving `@lucasschirm/bhai` through the workspace link requires `pnpm run build` to have produced `dist/` first. Keeping it separate stops that build dependency from leaking into the root typecheck.
- **`vite.config.ts`** — Minimal Vite config with `@mlc-ai/web-llm` pre-bundling excluded (MLC does its own wasm/worker loading). Comments explain the COOP/COEP header tradeoff. `list.js` is CommonJS and needs no special handling — Vite's default dep pre-bundling converts it.
- **`index.html`** — Semantic HTML5 structure: `<header class="statusbar">` (model selector, status indicator), `<main class="layout">` (conversation + telemetry columns), `<footer class="composer">` (textarea + Send/Stop button), and a top-level `<dialog id="mcp-error-dialog">` for MCP error details. Loads `/src/main.ts`.
  - The telemetry rail is split into `#cold-start-host`, `#telemetry-stats`, and `<section id="mcp-panel">`. **This split is load-bearing**: the telemetry panel replaces `#telemetry-stats`'s children wholesale after every turn, so anything that must survive a turn has to live outside it.
  - `#mcp-servers` is the List.js container — see the markup contract below.
- **`styles.css`** — Single dark theme, CSS Grid layout (desktop: 2-col, mobile: stacked), thermal color system (`--cold`, `--mid`, `--warm` interpolating based on measured decode tok/s). Status dot and decode gauge animate via `@keyframes thermal-shimmer`, `@keyframes thermal-pulse`, gated behind `@media (prefers-reduced-motion: reduce)`. Responsive down to ~360px.

### `src/main.ts` — bootstrap

The only file that knows the `index.html` id contract. Resolves every element with `byId()`, builds the component controllers, hands them to the two orchestrators, and gets out of the way. Also holds the WebGPU guard's fatal-error path and the `MLCEngineInstance` cast (a structural-typing artifact — see the comment there).

### `src/app/` — orchestration (no DOM)

- **`webllm-engine.ts`** — WebGPU capability check, the curated model allowlist intersected with `webllm.prebuiltAppConfig.model_list`, and `MLCEngine` creation with the cold-start progress callback.
- **`chat-controller.ts`** — Conversation lifecycle (`createConversation` per model selection, `loadConversation` to un-poison an aborted one), send/abort, TTFT measurement, and the `runtimeStatsText()` → telemetry pipeline. Narrows the `message.delta` payload at one boundary, because `ConversationEvents` carries an index signature and every payload arrives as `unknown`.
- **`mcp-controller.ts`** — Subscribes the panel to `McpManager`, wires the add-server form, persists the server list, and owns the card handlers. Takes a `createList(handlers)` factory rather than a ready-made list, because the list needs handlers that only exist once the controller is built.
- **`fatal-error.ts`** — The one path that spans two components (telemetry + composer), so it belongs to neither.

### `src/components/` — one module per DOM region

Each exports a `createX(...)` factory returning a controller object. Closure state replaces what used to be module-level `let`s, which is what makes each one testable against a detached fixture.

| Module | Owns |
| --- | --- |
| `status-indicator.ts` | `#status-dot` + `#status-label` |
| `model-select.ts` | `#model-select` — populate, read, change events |
| `composer.ts` | `#composer` — Send/Stop state, text, keyboard |
| `conversation-view.ts` | `#conversation` — user bubbles, assistant turns, inline errors |
| `cold-start-panel.ts` | `#cold-start-host` — download gauge |
| `telemetry-panel.ts` | `#telemetry-stats` — per-turn readouts |
| `mcp-server-list.ts` | `#mcp-servers` — whole-list render, expansion state, empty states |
| `mcp-server-card.ts` | one `<li>` server card, and the `data-*` search index it writes |
| `mcp-tool-list.ts` | one server's `<details>` tool list, filterable above 8 tools |
| `mcp-add-form.ts` | `#mcp-add-form` — read, busy, error, reset |
| `mcp-error-dialog.ts` | `#mcp-error-dialog` — `showModal()` / `close()` |

`conversation-view.ts`'s `beginAssistantTurn()` returns an object whose methods close over that message's own nodes, rather than a string id the caller has to look back up on every delta.

### `src/lib/` — pure helpers

- **`searchable-list.ts`** — the List.js adapter. See below.
- **`dom.ts`** — `el()`, `byId()`, `iconButton()`. `byId()` throws on a missing element rather than returning early: components are built once at startup against markup that ships in the same commit, so a missing node is a bug worth surfacing.
- **`stats.ts`** — `parseRuntimeStats()` → `{ prefillTps, decodeTps }`.
- **`thermal.ts`** — `thermalRatio(decodeTps)` → 0..1, `thermalColor(ratio)` → CSS color.
- **`format.ts`** — `formatTps`, `formatTokens`, `formatBytes`, `formatSeconds`.
- **`mcp-store.ts`** — `loadServers()` / `saveServers()` (localStorage, versioned payload, injectable backend so persistence is testable in Node), `parseHeaderLines()` (one `Key: Value` per line, first-colon split so values may contain colons), `validateServerUrl()` (http/https only), `errorHint()` (plain-language next step — notably mapping the opaque `TypeError: Failed to fetch` to the CORS explanation).

## List.js

### Where it is used

The MCP server list and the per-server tool lists. NOT the conversation stream — `list.update()` detaches and re-appends every visible node, which on a token-by-token stream would thrash the DOM and fight the auto-scroll — and NOT the model picker, which stays a native `<select>`.

### Rules

- **All List.js knowledge lives in `src/lib/searchable-list.ts`.** No other module imports `list.js`.
- **`list.add()` is never called.** List.js's templater assigns values with `elm.innerHTML = value` (`list.js@2.3.1`, `src/templater.js`), and its `item` option is an HTML-string template. MCP tool names, descriptions and error messages are untrusted remote text, so that path is an XSS sink. Components render the item nodes themselves; List.js only indexes them.
- **Indexed values are `data-*` attributes**, declared as `valueNames: [{ data: keys }]` — the only `valueName` form whose read *and* write paths are `getAttribute`/`setAttribute`. `mcp-server-card.ts` exports `SERVER_INDEX_KEYS` so the card and the list cannot disagree about what is indexed.
- **Nothing but List.js's own items may live inside `.js-list`.**

### Traps absorbed by the adapter

Each of these is real, verified against the 2.3.1 source, and cost time to find:

1. **Constructing over an empty list throws** — `Templater.init()` raises "The list needs to have at least one item on init" when `options.item` is absent and `.list` has no element children. The adapter passes a constant `item` template purely to satisfy that check. The panel starts empty on every page load, so this is the common case.
2. **`list.update()` wipes anything it does not own** — it calls `templater.clear()`, removing *every* child of `.list`, before re-appending matching items. Both empty states are therefore siblings of the `<ul>`, not items inside it.
3. **`reIndex()` drops search and sort state** — it resets `searched`/`filtered` and re-parses in DOM order without calling `update()`. `sync()` re-applies both.
4. **The search field is only bound on `keyup`** — List.js's `input` binding early-returns unless the value is empty (it exists to catch the native clear button). Paste, autofill, drag-and-drop and speech input all fire `input` alone and used to leave the list unfiltered. The adapter binds `input` itself.
5. **Search and sort hooks are bound once, at construction** — the `.js-search` input and `.js-sort` buttons must already exist in the markup, and the element passed to `new List()` must *contain* `.js-list` rather than be it.

### Markup contract

```html
<div id="mcp-servers">                      <!-- the List.js CONTAINER -->
  <div class="mcp-list-controls">
    <input class="js-search" type="search" />
    <button class="js-sort" data-sort="name">name</button>
    <button class="js-sort" data-sort="status">status</button>
  </div>
  <ul class="mcp-list js-list">…</ul>        <!-- only List.js items go in here -->
  <p id="mcp-empty">No servers attached.</p>          <!-- siblings, not items -->
  <p id="mcp-no-matches" hidden>No servers match…</p>
</div>
```

## Conventions

- **Pure lib vs components vs orchestration**: `src/lib/*` are DOM-free pure functions except `dom.ts` and `searchable-list.ts`, which are DOM utilities with no app knowledge. `src/components/*` own DOM and nothing else. `src/app/*` own kernel/engine calls and no DOM. `main.ts` is the only file that knows element ids.
- **TypeScript throughout the example.** The demo's whole point is a typed kernel, so it consumes the public API the way a typed consumer would — including the places where that is uncomfortable (the `unknown` event payload, the engine's overload-set mismatch), both of which are narrowed once with a comment rather than papered over globally.
- **JSDoc on every export**, including `@param`/`@returns`. Types come from the signature; the prose explains *why*.
- **Relative imports carry an explicit `.js` extension** even from `.ts` files, matching the root package. TS (`moduleResolution: "Bundler"`), Vite, and Vitest all resolve these to the sibling `.ts` source.
- **Never assign `innerHTML`.** Every node in the example is built with `createElement` + `textContent`. The MCP renderers are the security-critical case, but the rule holds everywhere so there is no exception to remember.
- **One-shot model load per model selection**: selecting a different model creates a fresh conversation rather than switching mid-conversation. Simplest correct behavior.
- **Thermal telemetry is data-driven**: the decode-gauge fill color and width come from live `engine.runtimeStatsText()` extraction each turn, not hardcoded.
- **MCP UI is a pure reflection of `McpManager` state**: `mcp-controller.ts` subscribes once and re-renders the whole list on every transition. Nothing about a server is tracked separately, including the persisted list (derived from `manager.list()` on write, so storage cannot drift from the screen). The two pieces of cross-render state that do exist — which tool disclosures are open, and the live filter/sort — are carried explicitly.
- **MCP credentials are stored in plaintext**: `saveServers()` persists request headers, `Authorization` included, to `localStorage` so reconnect is one click. Acceptable for a local demo and called out in the form's UI; a production host should re-prompt instead.
- **No push updates for MCP tool lists**: the client holds no SSE stream, so `notifications/tools/list_changed` never arrives. Each connected server card carries a manual refresh (⟳) button that calls `McpManager.refresh()` → `pollToolsList()`.

## Running the example

```bash
# From repo root:
pnpm install
pnpm run preview       # builds @lucasschirm/bhai, then starts Vite

# Or, iterative dev (rebuild the lib as you go):
pnpm run build
pnpm --filter bhai-example dev
```

Requirements:
- WebGPU-capable browser (Chrome/Edge 113+).
- Modern JavaScript (ES2022, async/await, dynamic import).

## Consumers / Testing

- **Unit tests** (`pnpm test` from the root, `example/**/*.test.ts` is in the vitest `include`):
  - `src/lib/{format,stats,thermal,mcp-store}.test.ts` — pure functions, default `node` environment.
  - `src/lib/searchable-list.test.ts` — the List.js adapter: empty-list construction, indexing, filtering on both `keyup` and `input`, search and sort surviving a re-index, match counts, teardown.
  - `src/components/mcp-server-card.test.ts` — **the untrusted-text regression guard**: an `<img src=x onerror=…>` payload in the server name, tool names and error message must land as text, with zero `img` elements produced.
  - `src/components/mcp-server-list.test.ts` — empty vs no-matches states, filtering by name and by indexed tool name, expansion surviving an unrelated re-render.
  - `src/components/conversation-view.test.ts` — delta routing, lazy Thought disclosure, independent concurrent turns.
- **DOM environment**: tests that touch the DOM carry `// @vitest-environment happy-dom` at the top of the file. The root `vitest.config.ts` stays `environment: "node"` by default. Note `list.js` reads `window` at module-evaluation time (`src/utils/events.js` line 1), so anything importing `searchable-list.ts` — directly or transitively — **must** carry the pragma or it throws on import.
- **Not unit-tested**: `main.ts`, `app/*`, and the thin components (`status-indicator`, `model-select`, `composer`, `cold-start-panel`, `telemetry-panel`, `mcp-add-form`, `mcp-error-dialog`). These are glue over APIs that are themselves tested; they are covered by the smoke run.
- **Smoke test**: `pnpm run preview` in a WebGPU browser — verify the model selector populates, a message streams with its Thought region, telemetry fills in, and Stop then re-send works.
- **Smoke-testing the MCP panel** needs a reachable HTTP MCP server. Any local streamable-HTTP server with permissive CORS works; failing that, a throwaway Node script answering `initialize`, `notifications/initialized`, and `tools/list` is enough to exercise connect → tools → filter → sort → refresh → remove. For the error path, point at a port with nothing listening and open the 🐛 dialog. Note the WebGPU guard in `main.ts` returns before the MCP wiring runs, so a headless browser needs `navigator.gpu` stubbed to reach the panel at all.

## Rules

- **Workspace-linked package only**: never import from `../../src/core/*.ts` or `../../src/plugins/*/*.ts`. Always import from `@lucasschirm/bhai` subpaths.
- **Biome linting applies** (`pnpm exec biome check example/`).
- **No persistent state in `app/*`**: all conversation/model state lives in `bhai`/`conversation` instances; the UI is a pure reflection of that state (or in-flight changes).
- **A new DOM region means a new component**, not a new export on an existing one. The old `ui.js` grew to 21 exports across six unrelated regions; that is the failure mode this layout exists to prevent.
