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
- `config.deferred` — skip discovery at connect time (TASK_0016) (optional).
- `options.callTimeoutMs` — per-call timeout in milliseconds (default 60_000).

#### Methods

- `connect(): Promise<void>` — handshake + (unless `deferred`) discovery.
- `pollToolsList(): Promise<ToolListDiff>` — manual re-sync fallback (no-op
  if the server did not declare `tools.listChanged`).
- `handleListChanged(): Promise<ToolListDiff>` — re-run `tools/list`, diff
  against the cached name set, register/unregister the delta.

#### Accessors

- `serverName: string` — the BHAI-local server name.
- `capabilities: ServerCapabilities | null` — server-declared capabilities.
- `supportsListChanged: boolean` — whether the server declared
  `tools.listChanged`.

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

27 tests in `src/plugins/mcp/client.test.ts`:

- Handshake: JSON-RPC 2.0 envelope, protocol version, session id, stateless
  server, `notifications/initialized`.
- Error handling: JSON-RPC error, non-2xx HTTP, malformed JSON.
- Discovery: pagination, namespacing, passthrough fields, deferred mode,
  custom headers, fallback server name.
- Re-sync: diff (added/removed/updated), no-op when `listChanged` not
  declared, `pollToolsList` delegation.
- Calls: original (unprefixed) name on wire, verbatim result round-trip,
  `outputSchema` validation (pass + fail with `isError` degradation),
  timeout, abort/cancellation with `notifications/cancelled`, progress seam.
