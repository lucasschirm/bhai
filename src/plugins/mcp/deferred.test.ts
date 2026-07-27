// TASK_0016 — deferred tool loading (`search_tools`) tests (§ 9.4).
//
// These tests exercise:
//  - `registerDeferredTools()` — registers only the 2 synthetic tools.
//  - `eagerRegisterAndAnswer()` — eager real-tool registration on first
//    synthetic call, `list_tools` returns full list, `search_tools`
//    returns keyword-filtered list.
//  - `McpClient.connect()` with `deferred: true` — fetches tools/list
//    (to cache), registers only the synthetic tools, real tools are
//    registered live when a synthetic tool is called.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { EventBus } from "../../core/event-bus.js"
import { ToolRegistry } from "../../tools/registry.js"
import { McpClient } from "./client.js"
import {
	type DeferredContext,
	type DeferredMcpTool,
	eagerRegisterAndAnswer,
	registerDeferredTools,
} from "./deferred.js"

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

async function flush(): Promise<void> {
	await new Promise((resolve) => setTimeout(resolve, 0))
}

function mockTool(name: string, description = `desc-${name}`): DeferredMcpTool {
	return {
		name,
		description,
		inputSchema: { type: "object" },
	}
}

beforeEach(() => {})
afterEach(() => {
	vi.unstubAllGlobals()
	vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// registerDeferredTools — synthetic tool registration.
// ---------------------------------------------------------------------------

describe("registerDeferredTools", () => {
	it("registers exactly two synthetic tools: list_tools and search_tools", () => {
		const bus = new EventBus()
		const registry = new ToolRegistry(bus)
		const ctx: DeferredContext = {
			serverName: "srv",
			registerTool: (def) => registry.addTool(def),
		}
		registerDeferredTools(ctx, async () => ({ content: [] }))
		const names = registry.listTools().map((t) => t.name)
		expect(names).toEqual(["mcp__srv__list_tools", "mcp__srv__search_tools"])
	})

	it("the synthetic tools have descriptions explaining their purpose", () => {
		const bus = new EventBus()
		const registry = new ToolRegistry(bus)
		const ctx: DeferredContext = {
			serverName: "srv",
			registerTool: (def) => registry.addTool(def),
		}
		registerDeferredTools(ctx, async () => ({ content: [] }))
		const listTool = registry.listTools().find((t) => t.name.endsWith("__list_tools"))
		const searchTool = registry.listTools().find((t) => t.name.endsWith("__search_tools"))
		expect(listTool?.description).toMatch(/List all tools/)
		expect(searchTool?.description).toMatch(/Search tools/)
	})

	it("search_tools requires a `query` parameter", () => {
		const bus = new EventBus()
		const registry = new ToolRegistry(bus)
		const ctx: DeferredContext = {
			serverName: "srv",
			registerTool: (def) => registry.addTool(def),
		}
		registerDeferredTools(ctx, async () => ({ content: [] }))
		const searchTool = registry.listTools().find((t) => t.name.endsWith("__search_tools"))
		const schema = searchTool?.inputSchema as {
			properties?: { query?: unknown }
			required?: string[]
		}
		expect(schema.properties?.query).toBeDefined()
		expect(schema.required).toContain("query")
	})
})

// ---------------------------------------------------------------------------
// eagerRegisterAndAnswer — list_tools and search_tools behavior.
// ---------------------------------------------------------------------------

describe("eagerRegisterAndAnswer", () => {
	it("list_tools registers all cached tools and returns the full list", async () => {
		const bus = new EventBus()
		const registry = new ToolRegistry(bus)
		const registered: string[] = []
		const ctx: DeferredContext = {
			serverName: "srv",
			registerTool: (def) => {
				registered.push(def.name)
				registry.addTool(def)
			},
		}
		const cached: DeferredMcpTool[] = [
			mockTool("t1", "weather tool"),
			mockTool("t2", "calendar tool"),
		]
		const result = await eagerRegisterAndAnswer(cached, ctx, "list_tools", {})
		// Both tools were registered (namespaced).
		expect(registered).toContain("mcp__srv__t1")
		expect(registered).toContain("mcp__srv__t2")
		// The answer contains both tools.
		const parsed = JSON.parse(result.content[0]?.text ?? "{}")
		expect(parsed.tools).toEqual([
			{ name: "t1", description: "weather tool" },
			{ name: "t2", description: "calendar tool" },
		])
	})

	it("search_tools registers all cached tools but returns only keyword matches", async () => {
		const bus = new EventBus()
		const registry = new ToolRegistry(bus)
		const registered: string[] = []
		const ctx: DeferredContext = {
			serverName: "srv",
			registerTool: (def) => {
				registered.push(def.name)
				registry.addTool(def)
			},
		}
		const cached: DeferredMcpTool[] = [
			mockTool("weather", "get weather forecast"),
			mockTool("calendar", "manage calendar events"),
			mockTool("weather_alert", "severe weather alerts"),
		]
		const result = await eagerRegisterAndAnswer(cached, ctx, "search_tools", { query: "weather" })
		// ALL tools were registered (eager registration on first call).
		expect(registered).toHaveLength(3)
		// But the answer only contains tools matching "weather".
		const parsed = JSON.parse(result.content[0]?.text ?? "{}")
		expect(parsed.tools).toEqual([
			{ name: "weather", description: "get weather forecast" },
			{ name: "weather_alert", description: "severe weather alerts" },
		])
	})

	it("search_tools matches case-insensitively on name and description", async () => {
		const ctx: DeferredContext = {
			serverName: "srv",
			registerTool: () => {},
		}
		const cached: DeferredMcpTool[] = [
			mockTool("t1", "Weather Forecast"),
			mockTool("t2", "calendar"),
		]
		const result = await eagerRegisterAndAnswer(cached, ctx, "search_tools", { query: "WEATHER" })
		const parsed = JSON.parse(result.content[0]?.text ?? "{}")
		expect(parsed.tools).toHaveLength(1)
		expect(parsed.tools[0].name).toBe("t1")
	})

	it("search_tools with no matches returns an empty tools array", async () => {
		const ctx: DeferredContext = {
			serverName: "srv",
			registerTool: () => {},
		}
		const cached: DeferredMcpTool[] = [mockTool("t1", "weather")]
		const result = await eagerRegisterAndAnswer(cached, ctx, "search_tools", {
			query: "nonexistent",
		})
		const parsed = JSON.parse(result.content[0]?.text ?? "{}")
		expect(parsed.tools).toEqual([])
	})

	it("search_tools with no query string returns all tools", async () => {
		const ctx: DeferredContext = {
			serverName: "srv",
			registerTool: () => {},
		}
		const cached: DeferredMcpTool[] = [mockTool("t1"), mockTool("t2")]
		const result = await eagerRegisterAndAnswer(cached, ctx, "search_tools", {})
		const parsed = JSON.parse(result.content[0]?.text ?? "{}")
		expect(parsed.tools).toHaveLength(2)
	})

	it("list_tools with an empty cache returns an empty tools array", async () => {
		const ctx: DeferredContext = {
			serverName: "srv",
			registerTool: () => {},
		}
		const result = await eagerRegisterAndAnswer([], ctx, "list_tools", {})
		const parsed = JSON.parse(result.content[0]?.text ?? "{}")
		expect(parsed.tools).toEqual([])
	})
})

// ---------------------------------------------------------------------------
// McpClient.connect() with deferred: true — full integration.
// ---------------------------------------------------------------------------

describe("McpClient — deferred: true integration", () => {
	it("connect() fetches tools/list (to cache) but registers only the 2 synthetic tools", async () => {
		const responses = [
			jsonResponse(initResult()),
			acceptedResponse(),
			jsonResponse({
				jsonrpc: "2.0",
				id: "x",
				result: {
					tools: [
						{ name: "t1", description: "d1", inputSchema: { type: "object" } },
						{ name: "t2", description: "d2", inputSchema: { type: "object" } },
					],
				},
			}),
		]
		const { fetch } = installFetchSequence(responses)
		const bus = new EventBus()
		const registry = new ToolRegistry(bus)
		const client = new McpClient(
			{ url: "https://example.com/mcp", name: "srv", deferred: true },
			registry,
			{ autoApproveTools: true },
		)
		await client.connect()
		await flush()
		// 3 fetch calls: initialize + initialized + tools/list.
		expect(fetch).toHaveBeenCalledTimes(3)
		// Only the 2 synthetic tools are registered.
		const names = registry
			.listTools()
			.map((t) => t.name)
			.sort((a, b) => a.localeCompare(b))
		expect(names).toEqual(["mcp__srv__list_tools", "mcp__srv__search_tools"])
	})

	it("calling list_tools eagerly registers all cached tools and returns the full list", async () => {
		const responses = [
			jsonResponse(initResult()),
			acceptedResponse(),
			jsonResponse({
				jsonrpc: "2.0",
				id: "x",
				result: {
					tools: [
						{ name: "t1", description: "d1", inputSchema: { type: "object" } },
						{ name: "t2", description: "d2", inputSchema: { type: "object" } },
					],
				},
			}),
		]
		installFetchSequence(responses)
		const bus = new EventBus()
		const registry = new ToolRegistry(bus)
		const client = new McpClient(
			{ url: "https://example.com/mcp", name: "srv", deferred: true },
			registry,
			{ autoApproveTools: true },
		)
		await client.connect()
		await flush()
		// Find the list_tools synthetic tool and call it.
		const listTool = registry.listTools().find((t) => t.name.endsWith("__list_tools"))
		expect(listTool).toBeDefined()
		const result = await listTool?.execute({
			conversation: undefined,
			params: {},
			toolCallId: "test-id",
			signal: new AbortController().signal,
			progress: () => {},
		})
		// The answer contains both tools.
		const parsed = JSON.parse(
			(result as { content: Array<{ text: string }> }).content[0]?.text ?? "{}",
		)
		expect(parsed.tools).toHaveLength(2)
		// The real tools are now registered.
		const names = registry
			.listTools()
			.map((t) => t.name)
			.sort((a, b) => a.localeCompare(b))
		expect(names).toContain("mcp__srv__t1")
		expect(names).toContain("mcp__srv__t2")
	})

	it("calling search_tools eagerly registers all cached tools and returns filtered results", async () => {
		const responses = [
			jsonResponse(initResult()),
			acceptedResponse(),
			jsonResponse({
				jsonrpc: "2.0",
				id: "x",
				result: {
					tools: [
						{ name: "weather", description: "get weather", inputSchema: { type: "object" } },
						{ name: "calendar", description: "manage events", inputSchema: { type: "object" } },
					],
				},
			}),
		]
		installFetchSequence(responses)
		const bus = new EventBus()
		const registry = new ToolRegistry(bus)
		const client = new McpClient(
			{ url: "https://example.com/mcp", name: "srv", deferred: true },
			registry,
			{ autoApproveTools: true },
		)
		await client.connect()
		await flush()
		const searchTool = registry.listTools().find((t) => t.name.endsWith("__search_tools"))
		expect(searchTool).toBeDefined()
		const result = await searchTool?.execute({
			conversation: undefined,
			params: { query: "weather" },
			toolCallId: "test-id",
			signal: new AbortController().signal,
			progress: () => {},
		})
		const parsed = JSON.parse(
			(result as { content: Array<{ text: string }> }).content[0]?.text ?? "{}",
		)
		expect(parsed.tools).toHaveLength(1)
		expect(parsed.tools[0].name).toBe("weather")
		// ALL tools were registered (eager), not just the match.
		const names = registry.listTools().map((t) => t.name)
		expect(names).toContain("mcp__srv__weather")
		expect(names).toContain("mcp__srv__calendar")
	})

	it("a second synthetic call does not re-register already-registered tools (idempotent)", async () => {
		const responses = [
			jsonResponse(initResult()),
			acceptedResponse(),
			jsonResponse({
				jsonrpc: "2.0",
				id: "x",
				result: {
					tools: [{ name: "t1", description: "d1", inputSchema: { type: "object" } }],
				},
			}),
		]
		installFetchSequence(responses)
		const bus = new EventBus()
		const registry = new ToolRegistry(bus)
		const client = new McpClient(
			{ url: "https://example.com/mcp", name: "srv", deferred: true },
			registry,
			{ autoApproveTools: true },
		)
		await client.connect()
		await flush()
		const listTool = registry.listTools().find((t) => t.name.endsWith("__list_tools"))
		// First call — registers t1.
		await listTool?.execute({
			conversation: undefined,
			params: {},
			toolCallId: "id1",
			signal: new AbortController().signal,
			progress: () => {},
		})
		expect(registry.listTools().map((t) => t.name)).toContain("mcp__srv__t1")
		// Second call — should still work and not duplicate.
		await listTool?.execute({
			conversation: undefined,
			params: {},
			toolCallId: "id2",
			signal: new AbortController().signal,
			progress: () => {},
		})
		// t1 is still registered exactly once (shadowing replaces, doesn't duplicate).
		const t1Tools = registry.listTools().filter((t) => t.name === "mcp__srv__t1")
		expect(t1Tools).toHaveLength(1)
	})
})
