# `src/plugins/mcp/` — MCP streamable-HTTP client plugin

## Purpose & scope

The built-in MCP (Model Context Protocol) client — streamable-HTTP transport only, spec rev 2025-11-25 (ARCHITECTURE.md § 9.3). Handles handshake, paginated tool discovery, live re-sync, progress/cancellation, and deferred loading via a `search_tools` convention for large tool sets (§ 9.4). Discovered remote tools are registered into `src/tools/registry.ts` with the `mcp__<server>__<tool>` name prefix, so the agent loop (TASK_0026) treats them identically to local plugin tools.

## Key files

- `index.ts` — subpath entry. Re-exports `McpClient`, `McpHandshakeError`, `McpCallError`, `McpTimeoutError`, `McpClientOptions`, `ToolListDiff`, the TASK_0013 approval surface (`ApprovalGate`, `McpApprovalOptions`, `McpApprovalError`, `guardCall`), the TASK_0014 capabilities surface (`McpClientCapabilityOptions`, `buildClientCapabilities`, `handleElicitation`, `handleSampling`, `handleRootsList`, `rootsListChangedNotification`), and the TASK_0016 deferred surface (`registerDeferredTools`, `eagerRegisterAndAnswer`, `DeferredMcpTool`, `DeferredContext`).
- `client.ts` — `McpClient` class (TASK_0011 + TASK_0012 + TASK_0013 + TASK_0014 + TASK_0016). One instance per attached MCP server. Owns the `initialize` → `notifications/initialized` handshake, the `MCP-Protocol-Version`/`Mcp-Session-Id` header contract, paginated `tools/list` discovery, live re-sync via `handleListChanged`/`pollToolsList`, a real `tools/call` execute binding with `outputSchema` validation (ajv), per-call timeouts, a progress seam, `AbortSignal`-driven cancellation, the human-in-the-loop approval gate, opt-in client capabilities (elicitation/sampling/roots), and deferred tool loading via `search_tools` synthetic tools. Internal to this subpath; the public `bh.addMcp()` entry point (TASK_0015) wraps it.
- `approval.ts` — TASK_0013: `ApprovalGate` function type, `McpApprovalOptions`, `McpApprovalError`, and the `guardCall()` refusal-policy helper. `McpClient.callTool()` wraps the transport call in `guardCall()`.
- `approval.test.ts` — 19 tests for the approval gate (refusal policy, autoApproveTools short-circuit, gate delegation, reason surfacing, McpHandshakeError).
- `capabilities.ts` — TASK_0014: `McpClientCapabilityOptions` (opt-in shape for elicitation/sampling/roots), `buildClientCapabilities()` (key-presence-based), and the three inbound request handlers. Sampling reuses the TASK_0013 `ApprovalGate`.
- `capabilities.test.ts` — 37 tests for capabilities (buildClientCapabilities key-presence, handleElicitation accept/decline/cancel/schema-validation, handleSampling gate/driver/selection, handleRootsList, McpClient wiring of handshake capabilities + inbound dispatch + notifyRootsChanged).
- `deferred.ts` — TASK_0016: `registerDeferredTools()` and `eagerRegisterAndAnswer()`. When `deferred: true`, only two synthetic tools are registered; real tools are cached and registered live on first synthetic call.
- `deferred.test.ts` — 13 tests for deferred loading (synthetic tool registration, eager registration on first call, list_tools full list, search_tools keyword filtering, idempotent re-registration, McpClient integration).
- `client.test.ts` — handshake, header contract, pagination, namespacing, error-handling, accessor, live resync, tools/call round-trip, outputSchema validation, timeout, abort/cancellation, and progress seam tests (mocks global `fetch`).

## Conventions

- **Streamable HTTP only**: no stdio, no SSE-only legacy transport. The MCP spec's streamable-HTTP rev is the sole transport.
- **Zero-adapter interop** (§ 12): an MCP server re-export is a transport wrapper, not a conversion layer — local and remote tools share one registry and one `CallToolResult` shape.
- **Tool results are untrusted data** (§ 13): the kernel surfaces remote tool output but never lets it drive availability or auto-approval unless the host marks the source trusted.

## Consumers

- `src/index.ts` re-exports this entry.
- `tsup.config.ts` builds it to `dist/plugins/mcp/index.js` + `.d.ts`.
- Hosts import `@lucasschirm/bhai/plugins/mcp` and pass the plugin to `bh.use()`, then attach MCP servers via `bh.addMcp()` (TASK_0015).
