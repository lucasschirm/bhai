// MCP (Model Context Protocol) shared type declarations (§ 9.3).
// Types only — no runtime logic.
//
// CROSS-TASK COORDINATION NOTE: TASK_0002's scope originally covered every
// shared type under src/types/, but the MCP-specific shapes
// (`McpServerConfig`) were not landed in that task's barrel before TASK_0011
// started. Per TASK_0011's dependency instructions ("if not already declared
// in TASK_0002's types barrel, this task adds it there and flags the addition
// for TASK_0015, which is the task that formally exposes `addMcp()`"),
// TASK_0011 adds them here — in the canonical types home — and flags the gap
// so TASK_0002/TASK_0015's owners can reconcile.
//
// The shapes match ARCHITECTURE.md § 6 line 215 (`{ url, headers?, name?,
// deferred? }`) and § 9.3's spec-conformance notes (spec rev 2025-11-25,
// streamable-HTTP transport only).

/**
 * Configuration for attaching an MCP server (§ 6 line 215, § 9.3).
 *
 * Passed to `bh.addMcp(config)` (TASK_0015's public entry point) and to the
 * internal {@link McpClient} constructor (TASK_0011). The shape is
 * `{ url, headers?, name?, deferred? }` per § 6 line 215.
 *
 * - `url` — the streamable-HTTP MCP endpoint (e.g. `https://example.com/mcp`).
 *   § 5 line 145: streamable HTTP "works identically in browsers and servers",
 *   which is why it's the only transport BHAI's core supports.
 * - `headers?` — extra HTTP headers attached to every outbound request (e.g.
 *   `Authorization`). Optional.
 * - `name?` — a BHAI-local server name used to namespace discovered tools as
 *   `mcp__<name>__<tool>` (§ 9.3). Optional: if omitted, TASK_0011 derives a
 *   fallback from the URL's hostname (documented inline in the client).
 * - `deferred?` — when true, discovery is skipped at connect time and tools
 *   are loaded on demand via a `search_tools` convention (§ 9.4). TASK_0016
 *   owns the deferred-loading variant; TASK_0011 only needs to recognize the
 *   field's existence so the constructor type is stable.
 */
export interface McpServerConfig {
	/** Streamable-HTTP MCP endpoint URL. */
	url: string
	/** Extra HTTP headers attached to every outbound request. */
	headers?: Record<string, string>
	/** BHAI-local server name; used to namespace tools as `mcp__<name>__<tool>`. */
	name?: string
	/** Skip discovery at connect time; load tools on demand (TASK_0016). */
	deferred?: boolean
}
