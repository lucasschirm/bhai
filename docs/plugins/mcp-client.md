# MCP Client (`src/plugins/mcp/`)

Documentation for the built-in MCP (Model Context Protocol) streamable-HTTP
client. Spec rev 2025-11-25. Architecture reference: ARCHITECTURE.md § 9.3.

## Overview

The `McpClient` class is the internal building block for attaching remote MCP
servers. One instance is constructed per attached server. It owns:

1. The JSON-RPC 2.0 handshake (`initialize` → `notifications/initialized`).
2. The `MCP-Protocol-Version` / `Mcp-Session-Id` HTTP header contract.
3. Paginated `tools/list` discovery, registering remote tools into the shared
   `ToolRegistry` under the `mcp__<server>__<tool>` namespace.
4. Live re-sync via `handleListChanged()` / `pollToolsList()`.
5. A real `tools/call` execute binding with `outputSchema` validation,
   per-call timeouts, a progress seam, and `AbortSignal`-driven cancellation.
6. A human-in-the-loop approval gate (TASK_0013) — every `tools/call` is
   vetted by a host-supplied `ApprovalGate` before the transport call is
   made. `autoApproveTools: true` short-circuits the gate.
7. Opt-in client capabilities (TASK_0014) — `elicitation`, `sampling`, and
   `roots` are advertised in the `initialize` handshake IFF the host opts
   in. Inbound `elicitation/create` / `sampling/createMessage` /
   `roots/list` requests are dispatched to the corresponding handlers.
8. Deferred tool loading (TASK_0016) — when `deferred: true`, only two
   synthetic tools (`mcp__<server>__list_tools` and
   `mcp__<server>__search_tools`) are registered; the full `tools/list`
   result is cached and real tools are registered live on the first
   synthetic-tool call.

The public `bh.addMcp()` entry point (TASK_0015) wraps this class; hosts do
not typically construct `McpClient` directly.

## Public API

```typescript
import {
  McpClient,
  McpHandshakeError,
  McpCallError,
  McpTimeoutError,
  type McpClientOptions,
  type ToolListDiff,
  // TASK_0013 — approval gate
  type ApprovalGate,
  type McpApprovalOptions,
  McpApprovalError,
  guardCall,
  // TASK_0014 — capabilities
  type McpClientCapabilityOptions,
  buildClientCapabilities,
  handleElicitation,
  handleSampling,
  handleRootsList,
  rootsListChangedNotification,
  // TASK_0016 — deferred loading
  type DeferredMcpTool,
  type DeferredContext,
  registerDeferredTools,
  eagerRegisterAndAnswer,
} from "@lucasschirm/bhai/plugins/mcp";
```

### `McpClient`

```typescript
new McpClient(config: McpServerConfig, toolRegistry: ToolRegistry, options?: McpClientOptions)
```

- `config.url` — streamable-HTTP MCP endpoint URL (required).
- `config.headers` — extra HTTP headers on every outbound request (optional).
- `config.name` — BHAI-local server name for tool namespacing (optional;
  derived from URL hostname if omitted).
- `config.deferred` — fetch `tools/list` at connect time but register only
  the two synthetic `list_tools`/`search_tools` tools (TASK_0016) (optional).
- `config.trusted` — mark this server's tools/annotations as trusted
  (TASK_0013, default `false`). Consumed by the availability filtering seam
  (TASK_0017); inert in the client itself.
- `options.callTimeoutMs` — per-call timeout in milliseconds (default 60_000).
- `options.approvalGate` — host-supplied `ApprovalGate` function (TASK_0013).
  Called before every `tools/call`; refusal prevents the transport call.
- `options.autoApproveTools` — short-circuit the approval gate (TASK_0013).
  When `true`, no gate is required and all calls proceed.
- `options.elicitation` — opt in to the `elicitation` capability (TASK_0014).
  Requires an `onElicit` handler.
- `options.sampling` — opt in to the `sampling` capability (TASK_0014).
  Optionally specify a preferred `driver`.
- `options.roots` — opt in to the `roots` capability (TASK_0014).
  Requires a `getRoots` function.
- `options.driverRegistry` — driver registry for sampling routing (TASK_0014).

#### Methods

- `connect(): Promise<void>` — handshake + discovery (eager or deferred).
- `pollToolsList(): Promise<ToolListDiff>` — manual re-sync fallback (no-op
  if the server did not declare `tools.listChanged`).
- `handleListChanged(): Promise<ToolListDiff>` — re-run `tools/list`, diff
  against the cached name set, register/unregister the delta.
- `handleInboundRequest(id, method, params): Promise<InboundRequestResult>`
  — dispatch an inbound server-to-client request to the appropriate
  capability handler (TASK_0014).
- `notifyRootsChanged(): Promise<void>` — send
  `notifications/roots/list_changed` to the server (TASK_0014). No-op if
  `roots` is not opted in.

#### Accessors

- `serverName: string` — the BHAI-local server name.
- `capabilities: ServerCapabilities | null` — server-declared capabilities.
- `supportsListChanged: boolean` — whether the server declared
  `tools.listChanged`.
- `isTrusted(): boolean` — whether this client's server was marked trusted
  (TASK_0013).

### Error classes

- `McpHandshakeError` — handshake/discovery failures (non-2xx HTTP, JSON-RPC
  error, malformed body).
- `McpCallError` — `tools/call` failures (JSON-RPC error, non-2xx HTTP).
- `McpTimeoutError` — per-call timeout exceeded (carries `toolName` +
  `timeoutMs`).

## Known gaps (documented explicitly)

### SSE-streamed responses

The streamable-HTTP transport permits a server to respond with
`Content-Type: text/event-stream` instead of `application/json`. This client
only parses the plain-JSON case. Full SSE-stream parsing is deferred to a
future task. Servers that only ever respond with SSE streams (rare for
request/response methods like `initialize` and `tools/list`) are not
supported.

### Live push notifications

Receiving unsolicited server-to-client notifications like
`notifications/tools/list_changed` requires an open SSE stream. Since full
SSE-stream listening is not implemented, this client does not automatically
receive push notifications. Use `pollToolsList()` as a manual fallback (e.g.
on a timer).

## Test coverage

- 27 tests in `src/plugins/mcp/client.test.ts` — handshake, header contract,
  pagination, namespacing, error-handling, accessor, live resync, tools/call
  round-trip, outputSchema validation, timeout, abort/cancellation, progress
  seam, deferred mode (TASK_0016 updated to fetch-and-cache semantics).
- 19 tests in `src/plugins/mcp/approval.test.ts` (TASK_0013) — refusal
  policy, autoApproveTools short-circuit, gate delegation, reason surfacing.
- 37 tests in `src/plugins/mcp/capabilities.test.ts` (TASK_0014) —
  buildClientCapabilities key-presence, handleElicitation accept/decline/cancel,
  handleSampling gate/driver/selection, handleRootsList, McpClient wiring.
- 13 tests in `src/plugins/mcp/deferred.test.ts` (TASK_0016) — synthetic tool
  registration, eager registration on first call, list_tools/search_tools
  behavior, idempotent re-registration, McpClient integration.
