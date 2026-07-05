// Root superset barrel: re-exports the core kernel and every plugin.
// Consumers who want a minimal surface should import from '@lucasschirm/bhai/core'
// or a specific '@lucasschirm/bhai/plugins/*' entry instead.
// Tree-shaking (`sideEffects: false`) drops any re-exports a consumer does not use,
// so importing only `{ Bhai }` from root does not pull plugin code into the bundle.
//
// Adding a new plugin means appending one `export * from './plugins/<name>/index.js';`
// line here, plus the matching `package.json` exports entry and `tsup.config.ts` entry.
export * from "./types/index.js"
export * from "./core/index.js"
export * from "./plugins/webllm/index.js"
export * from "./plugins/ollama/index.js"
export * from "./plugins/mcp/index.js"
export * from "./plugins/interop/pi/index.js"
export * from "./plugins/interop/opencode/index.js"
