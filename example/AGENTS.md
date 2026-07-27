# `example/` — WebLLM chat browser example

## Purpose & scope

A vanilla JavaScript (no framework, no TypeScript) browser example demonstrating BHAI's core capabilities:
streaming responses, in-browser model execution via WebLLM, live telemetry (decode/prefill tokens per second, time-to-first-token, context usage), and framework-side parsing of reasoning blocks (`<think>...</think>` regions, via `parseThink: true`).

Consumes the WORKSPACE-LINKED, BUILT `dist/` output of `@lucasschirm/bhai` (via `workspace:*` dependency + `pnpm run build` running first), never source imports (`../../src/*.ts`). This ensures the example exercises the real published subpath exports and tree-shaking behavior.

## Current state

Phase 1 (scaffolding + browser wiring): complete. Pure-lib phase complete (concurrent: `src/lib/*.js` + tests). Browser-wiring phase complete: `src/main.js` (orchestration), `src/ui.js` (DOM helpers), `index.html` (semantic markup), `styles.css` (thermal design system).

## Key files

- **`package.json`** — `bhai-example` workspace member. Private. Depends on root `@lucasschirm/bhai` via `workspace:*` and `@mlc-ai/web-llm ^0.2.79` as a production dependency.
- **`vite.config.js`** — Minimal Vite config with `@mlc-ai/web-llm` pre-bundling excluded (MLC does its own wasm/worker loading). Comments explain COOP/COEP header tradeoff.
- **`index.html`** — Semantic HTML5 structure: `<header class="statusbar">` (model selector, status indicator), `<main class="layout">` (conversation + telemetry columns), `<footer class="composer">` (textarea + Send/Stop button). No framework, plain DOM queries in `ui.js`.
- **`styles.css`** — Single dark theme, CSS Grid layout (desktop: 2-col, mobile: stacked), thermal color system (`--cold`, `--mid`, `--warm` interpolating based on measured decode tok/s). Status dot and decode gauge animate via `@keyframes thermal-shimmer`, `@keyframes thermal-pulse`, gated behind `@media (prefers-reduced-motion: reduce)`. Responsive down to ~360px.
- **`src/main.js`** — Orchestration layer. Wires BHAI kernel + WebLLM engine + DOM:
  - WebGPU guard at startup.
  - Curated model allowlist (Qwen3, Llama, Phi) intersected at runtime with `webllm.prebuiltAppConfig.model_list`.
  - Creates MLCEngine with `initProgressCallback` for cold-start download progress.
  - Initializes BHAI instance, registers WebLLM driver, initializes kernel.
  - Wires model selector to recreate conversations per model.
  - Implements message sending with full `sendMessage()` → stream events → stats extraction → telemetry update flow.
  - Tracks time-to-first-token, parse runtime stats via `engine.runtimeStatsText()`, calls `ui.js` render functions.
  - Implements Stop button (calls `conversation.abort()`) and error handling.
- **`src/ui.js`** — DOM helpers. Exports functions `main.js` calls:
  - `showFatalError(message)` — display an error and hide composer.
  - `populateModelSelect(modelIds, selectedId)` — populate `<select>`.
  - `setStatus(state, label)` — update `#status-dot` data-state and label.
  - `showColdStartPanel(progress, text)` — render download progress panel with gauge.
  - `hideColdStartPanel()` — remove cold-start panel.
  - `beginAssistantTurn()` — create new assistant message DOM node, return handle.
  - `appendThoughtDelta(turnHandle, delta)` — stream thought content (with `<details>` collapsible region).
  - `appendAnswerDelta(turnHandle, delta)` — stream answer text.
  - `appendUserMessage(text)` — add user message bubble.
  - `updateTelemetry({ prefillTps, decodeTps, ttft, inputTokens, outputTokens, contextWindow, contextUsagePercent, decodeColor, decodeRatio })` — render live stats panel with thermal-colored decode gauge + context bar.
  - `setComposerState(state)` — toggle textarea/button disabled, label Send↔Stop.
  - `clearEmptyState()` — remove intro placeholder.
- **`src/lib/stats.js`** — (concurrent: other agent) Parses `engine.runtimeStatsText()` output → `{ prefillTps, decodeTps }`.
- **`src/lib/thermal.js`** — (concurrent: other agent) `thermalRatio(decodeTps)` → 0..1, `thermalColor(ratio)` → CSS color.
- **`src/lib/format.js`** — (concurrent: other agent) `formatTps(n)`, `formatTokens(n)`, `formatBytes(n)`, `formatSeconds(n)` — string formatters for telemetry display.
- **`src/lib/*.test.ts`** — Unit tests for the lib functions (vitest, Node environment).

## Conventions

- **Pure lib vs browser wiring**: `src/lib/*.js` are pure functions with no DOM/browser-specific logic (testable in Node). `src/main.js` and `src/ui.js` handle browser logic and always import built `@lucasschirm/bhai` (never source), and together they form the browser-specific wiring layer.
- **No TypeScript in the browser layer**: `src/main.js`, `src/ui.js` are plain `.js` files for simplicity (types inferred from JSDoc). Reduces build complexity and exercise what a minimal browser consumer looks like.
- **JSDoc comments on all exports** in `ui.js` and `main.js` for IDE support.
- **One-shot model load per model selection**: When the user selects a different model, a fresh conversation is created (rather than model-switching mid-conversation). Simplest correct behavior.
- **Thermal telemetry is data-driven**: The decode-gauge fill color and width come from live `engine.runtimeStatsText()` extraction each turn, not hardcoded.
- **Context usage bar hidden if no contextWindow known**: Graceful fallback.

## Running the example

```bash
# From repo root:
pnpm install
pnpm run preview       # builds @lucasschirm/bhai, then starts Vite preview

# Or, iterative dev (rebuild lib/main.js as you go):
pnpm run build
pnpm --filter bhai-example dev
```

Requirements:
- WebGPU-capable browser (Chrome/Edge 113+).
- Modern JavaScript (ES2022, async/await, dynamic import).

## Consumers / Testing

- **Manual smoke test**: The orchestrator runs `pnpm run preview` and verifies the page loads, model selector populates, and first message can be sent (basic interaction test).
- **Unit tests for lib functions**: `src/lib/*.test.ts` run via `pnpm test` (root). Browser-wiring code (`src/main.js`, `src/ui.js`) is not unit-tested — they are exercised only by the smoke run. This is acceptable because the browser layer is thin glue around BHAI APIs and lib functions (which are tested), and Vite's build validates the syntax.

## Rules

- **No modifications to `src/lib/*`** by the browser-wiring agent (other agent owns pure libs).
- **Workspace-linked package only**: Never import from `../../src/core/*.ts` or `../../src/plugins/*/*.ts`. Always import from `@lucasschirm/bhai` subpaths.
- **Biome linting applies** (run `pnpm exec biome check example/src/main.js example/src/ui.js example/vite.config.js` to verify).
- **No persistent state in main.js**: All conversation/model state lives in `bhai`/`conversation` instances; the UI is a pure reflection of that state (or in-flight changes).
