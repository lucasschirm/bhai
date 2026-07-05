# `src/plugins/ollama/` — Ollama driver plugin

## Purpose & scope
The Ollama driver plugin — talks to a local/remote Ollama server over plain `fetch` (ARCHITECTURE.md § 10). Implements `BHAIDriver` (from `src/types/driver.ts`) with no environment-specific bindings, so it runs in any runtime that has `fetch`.

## Key files
- `index.ts` — subpath entry. Currently a stub (`export {}`) populated by TASK_0020.

## Conventions
- **No peer deps**: unlike `webllm/`, this plugin needs only `fetch`, so it declares no peer dependency. It's pure web-standard.
- **Credential resolution** (§ 10.4) is the host's/auth capability's job, not this plugin's — the driver never reads files or env vars for credentials.

## Consumers
- `src/index.ts` re-exports this entry.
- `tsup.config.ts` builds it to `dist/plugins/ollama/index.js` + `.d.ts`.
- Hosts import `@lucasschirm/bhai/plugins/ollama` and pass the plugin to `bh.use()`.
