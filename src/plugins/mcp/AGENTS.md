# `src/plugins/mcp/` — MCP streamable-HTTP client plugin

## Purpose & scope
The built-in MCP (Model Context Protocol) client — streamable-HTTP transport only, spec rev 2025-11-25 (ARCHITECTURE.md § 9.3). Handles handshake, paginated tool discovery, live re-sync, progress/cancellation, and deferred loading via a `search_tools` convention for large tool sets (§ 9.4). Discovered remote tools are registered into `src/tools/registry.ts` with the `mcp__<server>__<tool>` name prefix, so the agent loop (TASK_0026) treats them identically to local plugin tools.

## Key files
- `index.ts` — subpath entry. Currently a stub (`export {}`) populated by TASK_0011-0016.

## Conventions
- **Streamable HTTP only**: no stdio, no SSE-only legacy transport. The MCP spec's streamable-HTTP rev is the sole transport.
- **Zero-adapter interop** (§ 12): an MCP server re-export is a transport wrapper, not a conversion layer — local and remote tools share one registry and one `CallToolResult` shape.
- **Tool results are untrusted data** (§ 13): the kernel surfaces remote tool output but never lets it drive availability or auto-approval unless the host marks the source trusted.

## Consumers
- `src/index.ts` re-exports this entry.
- `tsup.config.ts` builds it to `dist/plugins/mcp/index.js` + `.d.ts`.
- Hosts import `@lucasschirm/bhai/plugins/mcp` and pass the plugin to `bh.use()`, then attach MCP servers via `bh.addMcp()` (TASK_0015).
