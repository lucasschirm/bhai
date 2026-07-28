// @vitest-environment happy-dom

import type { McpServerState, McpServerTool } from "@lucasschirm/bhai/plugins/mcp"
import { beforeEach, describe, expect, it } from "vitest"
import type { McpCardHandlers } from "./mcp-server-card.js"
import { createMcpServerList } from "./mcp-server-list.js"

/** Handlers that do nothing — this suite is about rendering, not actions. */
const NOOP_HANDLERS: McpCardHandlers = {
	onRefresh: () => {},
	onRetry: () => {},
	onRemove: () => {},
	onShowError: () => {},
}

/** Recreate the `#mcp-servers` region from `index.html`. */
function fixture(): HTMLElement {
	document.body.innerHTML = `
		<div id="mcp-servers">
			<div class="mcp-list-controls" id="mcp-list-controls" hidden>
				<input class="js-search" type="search" />
				<button type="button" class="js-sort" data-sort="name">name</button>
				<button type="button" class="js-sort" data-sort="status">status</button>
			</div>
			<ul class="mcp-list js-list" id="mcp-server-list"></ul>
			<p class="mcp-empty" id="mcp-empty">No servers attached.</p>
			<p class="mcp-empty" id="mcp-no-matches" hidden>No servers match that filter.</p>
		</div>
	`
	return document.getElementById("mcp-servers") as HTMLElement
}

/** Build a server snapshot with sane defaults. */
function serverState(
	id: string,
	serverName: string,
	status: McpServerState["status"] = "connected",
	tools: McpServerTool[] = [],
): McpServerState {
	return {
		id,
		config: { url: `https://${serverName}.example/mcp` },
		serverName,
		status,
		tools,
		deferred: false,
	} as McpServerState
}

/** `n` tools named `tool-0`, `tool-1`, … */
function tools(n: number): McpServerTool[] {
	return Array.from({ length: n }, (_, i) => ({
		name: `mcp__srv__tool-${i}`,
		shortName: `tool-${i}`,
		description: `does thing ${i}`,
	}))
}

describe("createMcpServerList", () => {
	beforeEach(() => {
		document.body.innerHTML = ""
	})

	it("shows the empty state and hides the controls when nothing is attached", () => {
		const root = fixture()
		createMcpServerList(root, NOOP_HANDLERS).render([])

		expect((document.getElementById("mcp-empty") as HTMLElement).hidden).toBe(false)
		expect((document.getElementById("mcp-list-controls") as HTMLElement).hidden).toBe(true)
		expect((document.getElementById("mcp-no-matches") as HTMLElement).hidden).toBe(true)
	})

	it("renders a card per server and reveals the controls", () => {
		const root = fixture()
		createMcpServerList(root, NOOP_HANDLERS).render([
			serverState("a", "alpha"),
			serverState("b", "beta", "error"),
		])

		expect(root.querySelectorAll(".mcp-server")).toHaveLength(2)
		expect((document.getElementById("mcp-empty") as HTMLElement).hidden).toBe(true)
		expect((document.getElementById("mcp-list-controls") as HTMLElement).hidden).toBe(false)
	})

	it("keeps the empty states outside the List.js-managed <ul>", () => {
		// List.js clears every child of `.js-list` on each update, so an empty
		// state placed inside it would vanish on the first render.
		const root = fixture()
		const list = createMcpServerList(root, NOOP_HANDLERS)

		list.render([serverState("a", "alpha")])
		list.render([])

		expect(document.getElementById("mcp-empty")).not.toBeNull()
		expect(document.getElementById("mcp-no-matches")).not.toBeNull()
	})

	it("shows the no-matches state when a filter excludes everything", () => {
		const root = fixture()
		createMcpServerList(root, NOOP_HANDLERS).render([
			serverState("a", "alpha"),
			serverState("b", "beta"),
		])

		const search = root.querySelector(".js-search") as HTMLInputElement
		search.value = "nothing-matches-this"
		search.dispatchEvent(new Event("keyup"))

		expect((document.getElementById("mcp-no-matches") as HTMLElement).hidden).toBe(false)
		// "No servers attached" would be a lie — two are attached, both filtered out.
		expect((document.getElementById("mcp-empty") as HTMLElement).hidden).toBe(true)

		search.value = ""
		search.dispatchEvent(new Event("keyup"))
		expect((document.getElementById("mcp-no-matches") as HTMLElement).hidden).toBe(true)
	})

	it("filters servers by name and by the tools they expose", () => {
		const root = fixture()
		createMcpServerList(root, NOOP_HANDLERS).render([
			serverState("a", "alpha", "connected", [
				{ name: "mcp__alpha__search_issues", shortName: "search_issues", description: "" },
			]),
			serverState("b", "beta"),
		])

		const search = root.querySelector(".js-search") as HTMLInputElement
		const names = () =>
			Array.from(root.querySelectorAll<HTMLElement>(".mcp-server")).map((c) => c.dataset.name)

		search.value = "beta"
		search.dispatchEvent(new Event("keyup"))
		expect(names()).toEqual(["beta"])

		// A tool name finds the server exposing it, even though it is not visible
		// on the collapsed card.
		search.value = "search_issues"
		search.dispatchEvent(new Event("keyup"))
		expect(names()).toEqual(["alpha"])
	})

	it("keeps an expanded tool disclosure open across an unrelated re-render", () => {
		// Every manager transition re-renders the whole list. Without carrying the
		// expansion state, one server connecting would snap another's tools shut.
		const root = fixture()
		const list = createMcpServerList(root, NOOP_HANDLERS)

		list.render([serverState("a", "alpha", "connected", tools(3))])
		const details = root.querySelector("details.mcp-tools") as HTMLDetailsElement
		details.open = true
		details.dispatchEvent(new Event("toggle"))

		list.render([
			serverState("a", "alpha", "connected", tools(3)),
			serverState("b", "beta", "connecting"),
		])

		const reRendered = root.querySelector("details.mcp-tools") as HTMLDetailsElement
		expect(reRendered.open).toBe(true)
	})

	it("forgets expansion state for a server that goes away", () => {
		const root = fixture()
		const list = createMcpServerList(root, NOOP_HANDLERS)

		list.render([serverState("a", "alpha", "connected", tools(3))])
		const details = root.querySelector("details.mcp-tools") as HTMLDetailsElement
		details.open = true
		details.dispatchEvent(new Event("toggle"))

		// Removed, then re-added under the same id: a fresh attach should start
		// collapsed rather than inheriting a stale expansion.
		list.render([])
		list.render([serverState("a", "alpha", "connected", tools(3))])

		expect((root.querySelector("details.mcp-tools") as HTMLDetailsElement).open).toBe(false)
	})

	it("only renders a tool list for a connected server that has tools", () => {
		const root = fixture()
		const list = createMcpServerList(root, NOOP_HANDLERS)

		list.render([
			serverState("a", "alpha", "connected", []),
			serverState("b", "beta", "error", tools(3)),
		])

		expect(root.querySelectorAll("details.mcp-tools")).toHaveLength(0)
	})
})
