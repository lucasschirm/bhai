# `src/plugins/webllm/` — WebLLM driver plugin

## Purpose & scope
The WebLLM driver plugin — runs LLM inference in-browser via WebGPU (ARCHITECTURE.md § 10). Implements `BHAIDriver` (from `src/types/driver.ts`) on top of `@mlc-ai/web-llm`'s `MLCEngine`, which the host injects at runtime (never statically imported by the core).

## Key files
- `index.ts` — subpath entry. Currently a stub (`export {}`) populated by TASK_0019.

## Conventions
- **Peer dep, not a runtime dep**: `@mlc-ai/web-llm` is declared as a peer dependency alongside this subpath, so the core bundle never forces it. The host supplies the `MLCEngine` instance; this plugin wraps it as a `BHAIDriver`.
- **WebGPU is environment-specific**: this is one of the few places where a non-web-standard API (WebGPU) is touched. That's why it's a plugin subpath, not part of `src/core/` (§ 5: environment-specific surfaces live in drivers/plugins, not the kernel).

## Consumers
- `src/index.ts` re-exports this entry.
- `tsup.config.ts` builds it to `dist/plugins/webllm/index.js` + `.d.ts`.
- Hosts running in a WebGPU-capable browser import `@lucasschirm/bhai/plugins/webllm` and pass the plugin to `bh.use()`.
