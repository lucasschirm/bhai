/** @file The MCP servers panel's list: search, sort, and whole-list rendering. */

import type { McpServerState } from "@lucasschirm/bhai/plugins/mcp"
import { byId } from "../lib/dom.js"
import { type SearchableList, createSearchableList } from "../lib/searchable-list.js"
import { type McpCardHandlers, SERVER_INDEX_KEYS, renderServerCard } from "./mcp-server-card.js"
import { type ToolList, createToolList } from "./mcp-tool-list.js"

/** Controller returned by {@link createMcpServerList}. */
export interface McpServerList {
	/** Re-render the whole list from a fresh set of manager snapshots. */
	render(states: McpServerState[]): void
}

/**
 * Own the server list.
 *
 * Re-renders wholesale rather than patching: the list is a handful of items,
 * and whole-list rendering removes an entire class of stale-node bugs. The two
 * pieces of cross-render state that matter — which tool disclosures are open,
 * and the live filter/sort — are carried explicitly, the first in
 * `expandedTools` and the second inside the List.js adapter's `sync()`.
 *
 * @param root - The `#mcp-servers` container: holds the controls, the `.js-list`
 *   element, and both empty states
 * @param handlers - Card-level actions, forwarded to every card
 */
export function createMcpServerList(root: HTMLElement, handlers: McpCardHandlers): McpServerList {
	const list = byId("mcp-server-list", root)
	const controls = byId("mcp-list-controls", root)
	const empty = byId("mcp-empty", root)
	const noMatches = byId("mcp-no-matches", root)

	/**
	 * Ids of servers whose tool list the user has expanded. A full re-render
	 * replaces the `<details>` elements, which would otherwise snap shut on every
	 * state change — including an unrelated server's.
	 */
	const expandedTools = new Set<string>()

	/** Tool lists from the current render, destroyed before the next one. */
	let toolLists: ToolList[] = []

	/** How many servers exist, so the search callback can tell empty from filtered. */
	let total = 0

	const searchable: SearchableList = createSearchableList({
		root,
		keys: SERVER_INDEX_KEYS,
		onUpdate: (matching) => {
			noMatches.hidden = matching > 0 || total === 0
		},
	})

	return {
		render(states) {
			total = states.length

			// Drop expansion state for servers that no longer exist, so the set does
			// not grow without bound across a long session.
			const liveIds = new Set(states.map((state) => state.id))
			for (const id of expandedTools) {
				if (!liveIds.has(id)) expandedTools.delete(id)
			}

			for (const toolList of toolLists) toolList.destroy()
			toolLists = []

			const cards = states.map((state) => {
				let toolElement: HTMLElement | null = null

				if (state.status === "connected" && state.tools.length > 0) {
					const toolList = createToolList(state, {
						expanded: expandedTools.has(state.id),
						onToggle: (open) => {
							if (open) expandedTools.add(state.id)
							else expandedTools.delete(state.id)
						},
					})
					toolLists.push(toolList)
					toolElement = toolList.element
				}

				return renderServerCard(state, handlers, toolElement)
			})

			// Only the cards go inside `.js-list` — List.js clears every child of it
			// on each update, so the empty states live outside as siblings.
			list.replaceChildren(...cards)
			searchable.sync()

			empty.hidden = total > 0
			// A filter box over an empty list is noise; hide the controls until
			// there is something to filter.
			controls.hidden = total === 0
			if (total === 0) noMatches.hidden = true
		},
	}
}
