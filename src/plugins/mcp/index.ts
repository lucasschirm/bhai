// MCP streamable-HTTP client plugin subpath entry (ARCHITECTURE.md § 9.3).
//
// This subpath exposes the built-in MCP client building blocks. The public
// `bh.addMcp()` kernel entry point (TASK_0015) wraps the {@link McpClient}
// exported here; hosts importing this subpath directly typically do so to
// construct a client manually for advanced cases (e.g. custom discovery
// hooks) before passing it to `bh.addMcp()` or wiring it themselves.
//
// ENVIRONMENT BOUNDARY (§ 5): web-standard APIs only — `fetch`,
// `AbortController`, `crypto.randomUUID`, `Headers`. No Node built-ins, no
// SSE/stdio library. `ajv` is a pure-JS validator with no environment
// bindings (already a runtime dependency for TASK_0006's config step).
export {
	McpClient,
	McpCallError,
	McpHandshakeError,
	McpTimeoutError,
	type McpClientOptions,
	type ToolListDiff,
} from "./client.js"
