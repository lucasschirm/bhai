# `src/plugins/interop/opencode/` — OpenCode plugin interop

## Purpose & scope
Adapter bridging a subset of OpenCode plugins onto BHAI's plugin surface (ARCHITECTURE.md § 12). Lets a host reuse existing OpenCode plugins (capability-object style) without rewriting them.

## Key files
- `index.ts` — subpath entry. Currently a stub (`export {}`) populated by a future interop task.

## Conventions
- **Subset, not full fidelity**: only OpenCode plugin features that map cleanly onto BHAI's capability-object form (form 2, § 7.2) are supported.
- **Capability-object mapping**: OpenCode's hook keys map onto BHAI's `BHAIPluginCapabilities` allowlist (`tools`, `commands`, `initialize`, `dispose`, etc.).

## Consumers
- `src/index.ts` re-exports this entry.
- `tsup.config.ts` builds it to `dist/plugins/interop/opencode/index.js` + `.d.ts`.
- Hosts with an existing OpenCode plugin ecosystem import `@lucasschirm/bhai/plugins/interop/opencode` to reuse plugins.
