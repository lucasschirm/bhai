# WebLLM Chat Example

A vanilla JavaScript browser example demonstrating BHAI's core capabilities: streaming responses, in-browser model execution via WebLLM, live telemetry (decode/prefill tokens per second, time-to-first-token, context usage), and client-side parsing of reasoning blocks.

## What it is

**bhai · local** is a single-page chat application that runs a curated set of small language models directly in your browser using WebGPU. It demonstrates:

1. **Streaming responses** — Text arrives incrementally as the model generates tokens.
2. **Live decode/prefill telemetry** — Real-time measurement of tokens-per-second during prefill (KV cache population) and decode (token generation), displayed as an instrument panel.
3. **Time-to-first-token (TTFT)** — Latency from message send to first token received.
4. **Reasoning blocks** — `<think>...</think>` regions parsed client-side and hidden in a collapsible "Thought" panel (since WebLLM's driver only emits `kind: "text"` deltas, not structured reasoning deltas, parsing is a client-side concern).
5. **Model selection & cold-start feedback** — Download progress as weights are loaded from the cloud.
6. **Context usage** — Visual bar showing how much of the available context window is being used.
7. **Thermal design** — Visual metaphor where the app is cold/dim when idle, warming up as the model loads and runs (status dot, decode gauge, and download progress bar all interpolate from cold cyan → warm coral).

## Running it

### Prerequisites

- A WebGPU-capable browser: **Chrome 113+** or **Edge 113+** (Safari and Firefox do not yet support WebGPU).
- An internet connection (to download model weights the first time).
- ~2–3 GB of free disk space in your browser's cache (depending on model size; smaller models ~500 MB, larger ~2 GB).

### Quick start

From the repo root:

```bash
pnpm install
pnpm run preview   # Builds @lucasschirm/bhai, then starts the example server
```

Open your browser to `http://localhost:5173` (or whatever Vite reports). The model selector should populate; pick a model and send a message.

### Iterative development

If you're modifying the example code:

```bash
# Terminal 1: watch and build the package
pnpm run build        # One-time build
pnpm test:watch       # Or watch for lib changes

# Terminal 2: run the dev server
pnpm --filter bhai-example dev
```

Navigate to `http://localhost:5173`.

## How it works

### Architecture

```
main.js (orchestration)
├─ Loads BHAI kernel
├─ Registers WebLLM driver
├─ Wires conversation lifecycle
├─ Sends messages & measures TTFT
├─ Extracts stats via engine.runtimeStatsText()
└─ Calls ui.js render functions

ui.js (DOM helpers)
├─ populateModelSelect()
├─ setStatus(), showColdStartPanel()
├─ beginAssistantTurn(), appendThoughtDelta(), appendAnswerDelta()
├─ updateTelemetry()
└─ All direct DOM querying & mutation

Lib modules (pure functions, testable)
├─ think-stream.js — parse <think>...</think> blocks
├─ stats.js — extract tok/s from engine.runtimeStatsText()
├─ thermal.js — map decode tok/s to colors
└─ format.js — pretty-print numbers for display
```

### Thought splitting (client-side reasoning parsing)

WebLLM's driver only emits `kind: "text"` deltas (no structured reasoning channel). To surface a reasoning panel, the example parses `<think>...</think>` XML tags client-side:

1. **Per-turn streaming**: A new `createThinkSplitter()` instance is created for each assistant turn.
2. **Incremental parsing**: Each `message.delta` is fed into the splitter via `.push(delta)`, which yields `{ thoughtDelta, answerDelta }`.
3. **DOM updates**: Thought deltas go to a collapsible `<details>` region (hidden by default); answer deltas go to the main message body.

This works because:
- Models with reasoning (e.g., Qwen3) do emit their thinking as `<think>...</think>` in the response text.
- The parsing is stateful and handles tags arriving mid-delta.
- The thought region only becomes visible once any thought content is detected.

### Stats & telemetry

After each turn completes, the example calls `engine.runtimeStatsText()` and parses it:

```javascript
const statsText = await engine.runtimeStatsText()
const { prefillTps, decodeTps } = parseRuntimeStats(statsText)
```

Results are displayed in real-time as the telemetry panel updates:

- **Decode tok/s**: Tokens generated per second (the bottom phase of inference). Shown with a thermal-colored gauge whose fill/color update live based on this measurement.
- **Prefill tok/s**: Tokens processed per second during KV cache population (the first phase).
- **TTFT**: Time-to-first-token, measured from when `sendMessage()` was called to when the first delta arrived.
- **Tokens**: Input and output token counts (from `conversation.usage`).
- **Context**: A visual bar showing context window usage (output tokens ÷ max context size). Hidden if the model's context window is unknown.

All numbers are formatted for readability (`formatTps`, `formatTokens`, etc.).

### Model selection

The example maintains a curated allowlist of models (Qwen3, Llama, Phi variants) and intersects it at runtime against `webllm.prebuiltAppConfig.model_list` to handle different versions of the installed `@mlc-ai/web-llm` package:

```javascript
const ALLOWLIST = [
  "Qwen3-0.6B-q4f16_1-MLC",
  "Qwen3-1.7B-q4f16_1-MLC",
  "Llama-3.2-1B-Instruct-q4f16_1-MLC",
  "Llama-3.2-3B-Instruct-q4f16_1-MLC",
  "Phi-3.5-mini-instruct-q4f16_1-MLC",
]

const available = ALLOWLIST.filter((id) =>
  webllm.prebuiltAppConfig.model_list.some((m) => m.model_id === id),
)
```

The default model is the first Qwen3 in the available list (or the first available model if no Qwen3 is found). Each model selection creates a fresh conversation (simplest correct behavior).

### Cold-start feedback

When the user sends their first message, `engine.reload()` is called lazily (by the WebLLM driver), triggering downloads of model weights. The example displays a download progress panel:

```javascript
engine = new webllm.MLCEngine({
  initProgressCallback: (report) => {
    // report.progress: 0..1
    // report.text: shard/status string (e.g., "Downloading shard 3/10…")
    ui.showColdStartPanel(report.progress, report.text)
  },
})
```

The progress bar fill and color interpolate from cold cyan → warm coral. Once download completes, the status dot turns green (ready).

### Abort/Stop

While generating, the Send button becomes a Stop button. Clicking Stop calls `conversation.abort()`, which propagates an abort signal through the agent loop and cancels the in-flight `sendMessage()` promise. The UI state is reset in a `finally` block.

## Design: "Cold start → running hot"

The visual design uses a **thermal metaphor**:

- **Cold** (cyan, `#38bdf8`) — No model loaded, idle state.
- **Warming** (animated shimmer cyan↔coral) — Model is downloading.
- **Ready** (green, `#34d399`) — Model loaded, ready to accept input.
- **Generating** (pulsing coral, `#fb7185`) — Model is running, decoding tokens.

The status dot reflects the current state. The decode tok/s gauge also uses this thermal ramp: slow decode stays cool, fast decode gets warm. All animations respect `prefers-reduced-motion: reduce` for accessibility.

The layout is a two-column grid (desktop, ≥861px wide):
- **Left**: Conversation stream (chat bubbles).
- **Right**: Telemetry panel (fixed-height scrollable).

On mobile (<861px), it stacks into a single column.

## Troubleshooting

### "WebGPU unavailable — this demo needs a WebGPU-capable browser"

- **Cause**: You're using Safari, Firefox, or an older version of Chrome/Edge.
- **Solution**: Update to Chrome 113+ or Edge 113+. Enable WebGPU if needed (it's on by default in recent versions; if it's not, check `chrome://flags/#enable-webgpu`).

### "Model download failed — check your connection and try again"

- **Cause**: Network error during weight download, or `@mlc-ai/web-llm`'s CDN is unreachable.
- **Solution**:
  - Check your internet connection.
  - Try again (it may retry with exponential backoff).
  - If the issue persists, check the browser console for detailed error messages.
  - Verify you're using `@mlc-ai/web-llm ^0.2.70` or later.

### "No models loaded" or slow first token

- **Cause**: WebGPU initialization or model weight download is slow (common on first load or on slower hardware).
- **Solution**:
  - Wait — cold-start can take 20–60 seconds on first load (weights are ~500 MB–2 GB).
  - On subsequent runs, weights are cached in your browser, so it's much faster.
  - Check your GPU: WebGPU prefers discrete GPUs (NVIDIA, AMD). Integrated GPUs are slower.

### First token arrives slowly (high TTFT)

- **Cause**: KV cache population (prefill phase) takes time on the first token.
- **Solution**: Normal for the first token. Subsequent tokens should arrive faster (see the decode tok/s gauge). Try a smaller model (e.g., Qwen3-0.6B) for faster response.

### "Thought" panel never appears

- **Cause**: The model isn't generating `<think>...</think>` tags, or they're not formatted as expected.
- **Solution**: 
  - Confirm the model supports reasoning (e.g., Qwen3 does; Phi does not).
  - Try a different prompt that encourages reasoning (e.g., "Think step by step about...").
  - Check the browser console for any parsing errors.

### Browser tab crashes or becomes unresponsive

- **Cause**: WebGPU or WASM exceeded memory limits (can happen with very large models on low-memory devices).
- **Solution**:
  - Reload and try a smaller model.
  - Close other tabs to free memory.
  - Check your device's available RAM (WebLLM needs ~2–3x the model size in working memory).

## Development notes

### No framework, plain DOM

The example deliberately avoids frameworks (React, Vue, etc.) to demonstrate BHAI as a lightweight orchestration library. It uses vanilla JavaScript and the DOM directly.

### Workspace-linked package

The example imports `@lucasschirm/bhai` via the workspace (`workspace:*` dependency in `package.json`), ensuring it uses the BUILT `dist/` output (run `pnpm run build` first). It never imports from source (`../../src/*.ts`), which exercises the published subpath exports.

### Pure lib + browser wiring

The `src/lib/` functions (think-splitting, stats parsing, formatting) are pure and testable in Node (no browser globals). They run via `pnpm test` with vitest. The browser wiring (`src/main.js`, `src/ui.js`) is thin glue around BHAI and the libs — it's not unit-tested, only smoke-tested by `pnpm run preview`.

### Build output

Vite bundles `src/main.js`, `src/ui.js`, and the libs into a single JavaScript file that references the workspace-linked `@lucasschirm/bhai` by its published subpath names (`@lucasschirm/bhai/plugins/webllm`, etc.). The `dist/index.html` is served as-is.

## Further reading

- **`example/AGENTS.md`** — Implementation notes for developers working on this example.
- **`example/package.json`** — Dependencies and build scripts.
- **`example/vite.config.js`** — Vite configuration (note: `@mlc-ai/web-llm` is excluded from pre-bundling).
- **BHAI core docs**: `docs/core/kernel.md`, `docs/core/conversation.md` — Detailed BHAI API and concepts.
- **WebLLM docs**: https://github.com/mlc-ai/web-llm — Model selection, custom parameters, advanced features.
