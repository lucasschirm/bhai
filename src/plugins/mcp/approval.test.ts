// TASK_0013 — MCP approval-gate + untrusted-by-default tests (§ 9.3 items 6-7).
//
// These tests exercise the refusal policy implemented in `approval.ts` and the
// `McpClient` wiring that runs every `tools/call` through `guardCall` before
// any transport-layer `fetch` is attempted. They also assert the `trusted`
// flag defaults to `false`, is stored, and is exposed via `isTrusted()` —
// without asserting any filtering/approval behavior that reads it (that
// consumption is TASK_0017's job, not this task's).
//
// TEMPORARY INTEGRATION SEAM: the `ApprovalGate` function type exercised here
// is a placeholder for the real `tool(beforeCall)` blockable event
// TASK_0026 will build. These tests assert the seam's shape and refusal
// policy, NOT the eventual event-bus dispatch.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { EventBus } from "../../core/event-bus.js"
import { ToolRegistry } from "../../tools/registry.js"
import type { CallToolResult, ContentBlock } from "../../types/index.js"
import {
	type ApprovalCall,
	type ApprovalResult,
	McpApprovalError,
	guardCall,
	resolveAutoApprove,
} from "./approval.js"
import { McpClient } from "./client.js"

// ---------------------------------------------------------------------------
// Mock-fetch helpers (mirrors client.test.ts's pattern).
// ---------------------------------------------------------------------------

interface FetchCall {
	readonly url: string
	readonly init: RequestInit
}

function jsonResponse(
	body: unknown,
	opts: { sessionId?: string | null; status?: number } = {},
): Response {
	const headers = new Headers({ "Content-Type": "application/json" })
	if (opts.sessionId !== null) {
		headers.set("Mcp-Session-Id", opts.sessionId ?? "test-session-id")
	}
	return new Response(JSON.stringify(body), {
		status: opts.status ?? 200,
		headers,
	})
}

function acceptedResponse(): Response {
	return new Response(null, { status: 202 })
}

function installFetchSequence(responses: Response[]): {
	fetch: ReturnType<typeof vi.fn>
	calls: () => FetchCall[]
} {
	const calls: FetchCall[] = []
	let i = 0
	const fetchMock = vi.fn(async (url: string, init: RequestInit): Promise<Response> => {
		calls.push({ url, init })
		const response = responses[i]
		i++
		if (!response) {
			throw new Error(`test fetch mock: ran out of canned responses (call #${i} for ${url})`)
		}
		return response
	})
	vi.stubGlobal("fetch", fetchMock)
	return { fetch: fetchMock, calls: () => calls }
}

function rpcBody(call: FetchCall): { method: string; params?: unknown } {
	const raw = call.init.body as string
	return JSON.parse(raw)
}

/** A minimal `initialize` response result. */
function initResult(): unknown {
	return {
		jsonrpc: "2.0",
		id: "ignored",
		result: {
			protocolVersion: "2025-11-25",
			capabilities: { tools: { listChanged: false } },
			serverInfo: { name: "test-server", version: "1.0.0" },
		},
	}
}

/** A canned successful `tools/call` result. */
function callResult(text = "ok"): unknown {
	return {
		jsonrpc: "2.0",
		id: "ignored",
		result: {
			content: [{ type: "text", text }] as ContentBlock[],
			isError: false,
		} satisfies CallToolResult,
	}
}

/** Fresh client + registry + bus per test, with the given approval options. */
function freshClient(
	config: { url: string; name?: string; trusted?: boolean },
	approval?: { approvalGate?: ApprovalGateStub; autoApproveTools?: boolean },
): { client: McpClient; registry: ToolRegistry; bus: EventBus } {
	const bus = new EventBus()
	const registry = new ToolRegistry(bus)
	const client = new McpClient(config, registry, approval)
	return { client, registry, bus }
}

/** Flush the EventBus's microtask/FIFO chain (tool.registered dispatches). */
async function flush(): Promise<void> {
	await new Promise((resolve) => setTimeout(resolve, 0))
}

/** A test-double approval gate that records calls and returns a fixed result. */
type ApprovalGateStub = (call: ApprovalCall) => Promise<ApprovalResult>

function makeGate(result: ApprovalResult): { gate: ApprovalGateStub; calls: ApprovalCall[] } {
	const calls: ApprovalCall[] = []
	const gate: ApprovalGateStub = async (call) => {
		calls.push(call)
		return result
	}
	return { gate, calls }
}

beforeEach(() => {})
afterEach(() => {
	vi.unstubAllGlobals()
	vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// Pure `guardCall` refusal-policy unit tests.
// ---------------------------------------------------------------------------

describe("guardCall — refusal policy (§ 9.3 item 6)", () => {
	it("autoApproveTools: true short-circuits and never calls the gate", async () => {
		const { gate, calls } = makeGate({ approved: true })
		const onApproved = vi.fn(async () => "transport-result")
		const result = await guardCall(
			{ toolName: "mcp__s__t", serverName: "s", params: {} },
			{ approvalGate: gate, autoApproveTools: true },
			onApproved,
		)
		expect(result).toBe("transport-result")
		expect(onApproved).toHaveBeenCalledTimes(1)
		// The explicit opt-out short-circuits entirely — the gate is never
		// consulted even though one was supplied.
		expect(calls).toHaveLength(0)
	})

	it("no gate supplied and no autoApproveTools refuses with a descriptive error", async () => {
		const onApproved = vi.fn(async () => "should-not-run")
		const call = { toolName: "mcp__s__t", serverName: "s", params: {} }
		await expect(guardCall(call, undefined, onApproved)).rejects.toBeInstanceOf(McpApprovalError)
		await expect(guardCall(call, undefined, onApproved)).rejects.toThrow(
			/human-in-the-loop approver is required/,
		)
		// Transport layer never reached.
		expect(onApproved).not.toHaveBeenCalled()
	})

	it("no gate supplied but autoApproveTools: true proceeds", async () => {
		const onApproved = vi.fn(async () => "transport-result")
		const result = await guardCall(
			{ toolName: "mcp__s__t", serverName: "s", params: {} },
			{ autoApproveTools: true },
			onApproved,
		)
		expect(result).toBe("transport-result")
		expect(onApproved).toHaveBeenCalledTimes(1)
	})

	it("gate returning { approved: false, reason } refuses and surfaces the reason", async () => {
		const { gate } = makeGate({ approved: false, reason: "user declined" })
		const onApproved = vi.fn(async () => "should-not-run")
		const call = { toolName: "mcp__s__t", serverName: "s", params: {} }
		const promise = guardCall(call, { approvalGate: gate }, onApproved)
		await expect(promise).rejects.toBeInstanceOf(McpApprovalError)
		await expect(promise).rejects.toThrow(/user declined/)
		// Transport layer never reached.
		expect(onApproved).not.toHaveBeenCalled()
	})

	it("gate returning { approved: true } proceeds to the transport layer", async () => {
		const { gate, calls } = makeGate({ approved: true })
		const onApproved = vi.fn(async () => "transport-result")
		const result = await guardCall(
			{ toolName: "mcp__s__t", serverName: "s", params: { x: 1 } },
			{ approvalGate: gate },
			onApproved,
		)
		expect(result).toBe("transport-result")
		expect(onApproved).toHaveBeenCalledTimes(1)
		// The gate received the full call payload.
		expect(calls).toHaveLength(1)
		expect(calls[0]).toEqual({
			toolName: "mcp__s__t",
			serverName: "s",
			params: { x: 1 },
		})
	})

	it("gate returning { approved: false } with no reason still refuses with a clear message", async () => {
		const { gate } = makeGate({ approved: false })
		const onApproved = vi.fn(async () => "should-not-run")
		const promise = guardCall(
			{ toolName: "mcp__s__t", serverName: "s", params: {} },
			{ approvalGate: gate },
			onApproved,
		)
		await expect(promise).rejects.toBeInstanceOf(McpApprovalError)
		await expect(promise).rejects.toThrow(/refused by the approval gate/)
		expect(onApproved).not.toHaveBeenCalled()
	})
})

describe("resolveAutoApprove", () => {
	it("defaults to false when options are undefined", () => {
		expect(resolveAutoApprove(undefined)).toBe(false)
	})
	it("defaults to false when autoApproveTools is omitted", () => {
		expect(resolveAutoApprove({})).toBe(false)
	})
	it("returns true only when autoApproveTools is explicitly true", () => {
		expect(resolveAutoApprove({ autoApproveTools: true })).toBe(true)
		expect(resolveAutoApprove({ autoApproveTools: false })).toBe(false)
	})
})

// ---------------------------------------------------------------------------
// McpClient wiring — refusal happens before any transport-layer fetch.
// ---------------------------------------------------------------------------

/**
 * Wire a client with one discovered tool and run its `execute`. Returns the
 * fetch mock + recorded calls so tests can assert on transport behavior.
 */
async function connectAndInvoke(
	client: McpClient,
	registry: ToolRegistry,
	responses: Response[],
): Promise<{ fetch: ReturnType<typeof vi.fn>; calls: () => FetchCall[]; result: unknown }> {
	const { fetch, calls } = installFetchSequence(responses)
	await client.connect()
	await flush()
	const tool = registry.listTools().find((t) => t.name.startsWith("mcp__"))
	if (!tool) throw new Error("test fixture: no MCP tool registered")
	const result = await tool.execute({
		conversation: undefined,
		params: {},
		toolCallId: "test-call-id",
		signal: new AbortController().signal,
		progress: () => {},
	})
	return { fetch, calls, result }
}

describe("McpClient — approval gate wiring", () => {
	it("refuses a tools/call with no gate and no autoApproveTools, never reaching fetch", async () => {
		// Set up a client with NO approval options and a deferred discovery
		// (so we don't need to mock tools/list). We register a tool manually
		// to invoke its execute binding.
		const bus = new EventBus()
		const registry = new ToolRegistry(bus)
		const client = new McpClient({ url: "https://example.com/mcp", name: "s" }, registry)
		// Manually register a tool that proxies through the client's callTool
		// by reaching into the same execute shape the client would build.
		// Easiest path: do a real connect with deferred + a manual tool list.
		// Instead, simulate by registering a tool whose execute calls the
		// client's internal path via the public surface: we use the standard
		// connect flow with one mocked tool.
		const responses = [
			jsonResponse(initResult()),
			acceptedResponse(),
			jsonResponse({
				jsonrpc: "2.0",
				id: "x",
				result: {
					tools: [{ name: "t", description: "d", inputSchema: { type: "object" } }],
				},
			}),
		]
		const { fetch, calls } = installFetchSequence(responses)
		await client.connect()
		await flush()
		const tool = registry.listTools()[0]
		// Reset the fetch mock so we can assert no NEW fetch calls happen
		// during the refused execute.
		fetch.mockClear()
		const promise = tool.execute({
			conversation: undefined,
			params: {},
			toolCallId: "test-call-id",
			signal: new AbortController().signal,
			progress: () => {},
		})
		await expect(promise).rejects.toBeInstanceOf(McpApprovalError)
		await expect(promise).rejects.toThrow(/human-in-the-loop approver is required/)
		// The transport layer was never reached for tools/call.
		expect(fetch).not.toHaveBeenCalled()
		// Sanity: the only fetch calls so far were initialize + initialized +
		// tools/list (3 calls), none of which were tools/call.
		const methods = calls().map((c) => rpcBody(c).method)
		expect(methods).not.toContain("tools/call")
	})

	it("autoApproveTools: true proceeds to fetch and returns the tools/call result", async () => {
		const { client, registry } = freshClient(
			{ url: "https://example.com/mcp", name: "s" },
			{ autoApproveTools: true },
		)
		const responses = [
			jsonResponse(initResult()),
			acceptedResponse(),
			jsonResponse({
				jsonrpc: "2.0",
				id: "x",
				result: {
					tools: [{ name: "t", description: "d", inputSchema: { type: "object" } }],
				},
			}),
			// The tools/call response (4th fetch).
			jsonResponse(callResult("hello-from-server")),
		]
		const { fetch, result } = await connectAndInvoke(client, registry, responses)
		expect(fetch).toHaveBeenCalledTimes(4)
		const callResultValue = result as CallToolResult
		expect(callResultValue.content[0]).toMatchObject({ type: "text", text: "hello-from-server" })
	})

	it("gate returning { approved: false, reason } refuses and never reaches fetch", async () => {
		const { gate } = makeGate({ approved: false, reason: "user declined" })
		const { client, registry } = freshClient(
			{ url: "https://example.com/mcp", name: "s" },
			{ approvalGate: gate },
		)
		const responses = [
			jsonResponse(initResult()),
			acceptedResponse(),
			jsonResponse({
				jsonrpc: "2.0",
				id: "x",
				result: {
					tools: [{ name: "t", description: "d", inputSchema: { type: "object" } }],
				},
			}),
		]
		const { fetch } = installFetchSequence(responses)
		await client.connect()
		await flush()
		// Reset fetch to assert no tools/call is attempted.
		fetch.mockClear()
		const tool = registry.listTools()[0]
		const promise = tool.execute({
			conversation: undefined,
			params: {},
			toolCallId: "test-call-id",
			signal: new AbortController().signal,
			progress: () => {},
		})
		await expect(promise).rejects.toBeInstanceOf(McpApprovalError)
		await expect(promise).rejects.toThrow(/user declined/)
		expect(fetch).not.toHaveBeenCalled()
	})

	it("gate returning { approved: true } proceeds and returns the tools/call result", async () => {
		const { gate, calls: gateCalls } = makeGate({ approved: true })
		const { client, registry } = freshClient(
			{ url: "https://example.com/mcp", name: "s" },
			{ approvalGate: gate },
		)
		const responses = [
			jsonResponse(initResult()),
			acceptedResponse(),
			jsonResponse({
				jsonrpc: "2.0",
				id: "x",
				result: {
					tools: [{ name: "t", description: "d", inputSchema: { type: "object" } }],
				},
			}),
			jsonResponse(callResult("approved-result")),
		]
		const { result } = await connectAndInvoke(client, registry, responses)
		const callResultValue = result as CallToolResult
		expect(callResultValue.content[0]).toMatchObject({ type: "text", text: "approved-result" })
		// The gate was consulted with the namespaced tool name + server name.
		expect(gateCalls).toHaveLength(1)
		expect(gateCalls[0].toolName).toBe("mcp__s__t")
		expect(gateCalls[0].serverName).toBe("s")
	})
})

// ---------------------------------------------------------------------------
// `trusted` flag storage (inert — no behavior reads it in this task).
// ---------------------------------------------------------------------------

describe("McpClient — trusted flag storage (§ 9.3 item 7)", () => {
	it("defaults to false when omitted", () => {
		const bus = new EventBus()
		const registry = new ToolRegistry(bus)
		const client = new McpClient({ url: "https://example.com/mcp" }, registry)
		expect(client.isTrusted()).toBe(false)
	})

	it("stores true when explicitly passed", () => {
		const bus = new EventBus()
		const registry = new ToolRegistry(bus)
		const client = new McpClient({ url: "https://example.com/mcp", trusted: true }, registry)
		expect(client.isTrusted()).toBe(true)
	})

	it("stores false when explicitly passed false", () => {
		const bus = new EventBus()
		const registry = new ToolRegistry(bus)
		const client = new McpClient({ url: "https://example.com/mcp", trusted: false }, registry)
		expect(client.isTrusted()).toBe(false)
	})

	it("does not influence approval — a trusted server with no gate still refuses", async () => {
		// This asserts the flag is INERT in this task: trust does NOT bypass
		// the approval gate. Consumption of `trusted` for availability
		// filtering is TASK_0017's job.
		const { client, registry } = freshClient({ url: "https://example.com/mcp", trusted: true })
		expect(client.isTrusted()).toBe(true)
		const responses = [
			jsonResponse(initResult()),
			acceptedResponse(),
			jsonResponse({
				jsonrpc: "2.0",
				id: "x",
				result: {
					tools: [{ name: "t", description: "d", inputSchema: { type: "object" } }],
				},
			}),
		]
		const { fetch } = installFetchSequence(responses)
		await client.connect()
		await flush()
		fetch.mockClear()
		const tool = registry.listTools()[0]
		const promise = tool.execute({
			conversation: undefined,
			params: {},
			toolCallId: "test-call-id",
			signal: new AbortController().signal,
			progress: () => {},
		})
		await expect(promise).rejects.toBeInstanceOf(McpApprovalError)
		expect(fetch).not.toHaveBeenCalled()
	})
})

// ---------------------------------------------------------------------------
// McpApprovalError shape.
// ---------------------------------------------------------------------------

describe("McpApprovalError", () => {
	it("carries the tool name and reason", () => {
		const err = new McpApprovalError("mcp__s__t", "refused", "user declined")
		expect(err.name).toBe("McpApprovalError")
		expect(err.toolName).toBe("mcp__s__t")
		expect(err.reason).toBe("user declined")
		expect(err.message).toBe("refused")
	})

	it("reason is optional", () => {
		const err = new McpApprovalError("mcp__s__t", "refused")
		expect(err.reason).toBeUndefined()
	})
})
