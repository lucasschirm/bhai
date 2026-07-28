// @vitest-environment happy-dom

import type { McpServerState } from "@lucasschirm/bhai/plugins/mcp"
import { describe, expect, it, vi } from "vitest"
import { type McpCardHandlers, SERVER_INDEX_KEYS, renderServerCard } from "./mcp-server-card.js"

/** A payload that becomes an element the moment it is parsed as HTML. */
const XSS = '<img src=x onerror="globalThis.__pwned = true">'

/** Handlers that record which action fired for which id. */
function spyHandlers(): McpCardHandlers & { calls: string[] } {
	const calls: string[] = []
	return {
		calls,
		onRefresh: (id) => calls.push(`refresh:${id}`),
		onRetry: (id) => calls.push(`retry:${id}`),
		onRemove: (id) => calls.push(`remove:${id}`),
		onShowError: (id) => calls.push(`error:${id}`),
	}
}

/** Build a server snapshot with sane defaults. */
function serverState(overrides: Partial<McpServerState> = {}): McpServerState {
	return {
		id: "srv-1",
		config: { url: "https://example.com/mcp" },
		serverName: "example",
		status: "connected",
		tools: [],
		deferred: false,
		...overrides,
	} as McpServerState
}

describe("renderServerCard", () => {
	it("renders untrusted server text as text, never as markup", () => {
		// Tool names, descriptions, the server name and error messages all come
		// from whatever endpoint the user pasted a URL for. If any of them reached
		// an innerHTML sink, this payload would become a real <img> element.
		const card = renderServerCard(
			serverState({
				serverName: XSS,
				status: "error",
				error: {
					name: XSS,
					message: XSS,
					url: "https://example.com/mcp",
					at: Date.now(),
					phase: "connect",
				},
			}),
			spyHandlers(),
			null,
		)

		expect(card.querySelectorAll("img")).toHaveLength(0)
		expect(card.querySelector(".mcp-server-name")?.textContent).toBe(XSS)
		expect(card.dataset.name).toBe(XSS)
		expect(card.textContent).toContain(XSS)
	})

	it("indexes the keys the server list searches on", () => {
		const card = renderServerCard(
			serverState({
				tools: [
					{ name: "mcp__example__search", shortName: "search", description: "Find things" },
					{ name: "mcp__example__create", shortName: "create", description: "" },
				],
			}),
			spyHandlers(),
			null,
		)

		// Every key the list declares must actually be present, or search and sort
		// silently do nothing for that column.
		for (const key of SERVER_INDEX_KEYS) {
			expect(card.dataset[key]).toBeDefined()
		}
		expect(card.dataset.status).toBe("connected")
		expect(card.dataset.name).toBe("example")
		// Tool names are indexed but never displayed, so typing a tool name finds
		// the server exposing it.
		expect(card.dataset.tools).toBe("search create")
	})

	it("offers refresh and remove when connected", () => {
		const handlers = spyHandlers()
		const card = renderServerCard(serverState(), handlers, null)

		const labels = Array.from(card.querySelectorAll("button")).map((b) =>
			b.getAttribute("aria-label"),
		)
		expect(labels).toEqual(["Refresh tools for example", "Remove example"])

		for (const button of card.querySelectorAll("button")) {
			;(button as HTMLButtonElement).click()
		}
		expect(handlers.calls).toEqual(["refresh:srv-1", "remove:srv-1"])
	})

	it("offers error details and retry when failed", () => {
		const handlers = spyHandlers()
		const card = renderServerCard(
			serverState({
				status: "error",
				error: {
					name: "TypeError",
					message: "Failed to fetch",
					url: "https://example.com/mcp",
					at: Date.now(),
					phase: "connect",
				},
			}),
			handlers,
			null,
		)

		for (const button of card.querySelectorAll("button")) {
			;(button as HTMLButtonElement).click()
		}
		expect(handlers.calls).toEqual(["error:srv-1", "retry:srv-1", "remove:srv-1"])
		// The status line names the error but leaves the message to the dialog.
		expect(card.querySelector(".mcp-server-status")?.textContent).toBe("failed · TypeError")
	})

	it("calls out a connected server with no tools", () => {
		const card = renderServerCard(serverState({ tools: [] }), spyHandlers(), null)
		expect(card.querySelector(".mcp-server-status")?.textContent).toBe("connected · no tools")
	})

	it("nests the injected tool list", () => {
		const toolList = document.createElement("details")
		toolList.className = "mcp-tools"
		const card = renderServerCard(serverState(), spyHandlers(), toolList)
		expect(card.querySelector(".mcp-tools")).toBe(toolList)
	})

	it("shows the endpoint URL as the name's tooltip", () => {
		const card = renderServerCard(serverState(), spyHandlers(), null)
		expect(card.querySelector(".mcp-server-name")?.getAttribute("title")).toBe(
			"https://example.com/mcp",
		)
	})

	it("does not execute injected markup even when the card is inserted live", () => {
		const spy = vi.fn()
		Object.defineProperty(globalThis, "__pwned", { set: spy, configurable: true })

		const card = renderServerCard(serverState({ serverName: XSS }), spyHandlers(), null)
		document.body.appendChild(card)

		expect(spy).not.toHaveBeenCalled()
		card.remove()
	})
})
