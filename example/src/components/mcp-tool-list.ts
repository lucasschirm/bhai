/** @file One connected server's collapsible, filterable tool list. */

import type { McpServerState } from "@lucasschirm/bhai/plugins/mcp"
import { el } from "../lib/dom.js"
import { type SearchableList, createSearchableList } from "../lib/searchable-list.js"

/**
 * Tool count above which a filter box appears. Below it the list fits on screen
 * and a search field is just another thing to look past.
 */
const FILTER_THRESHOLD = 8

/** `data-*` keys indexed for the tool filter. */
const TOOL_INDEX_KEYS = ["tool", "description"]

/** Options for {@link createToolList}. */
export interface ToolListOptions {
	/** Whether the disclosure starts open, restored by the parent across renders. */
	expanded: boolean
	/** Called when the user toggles the disclosure. */
	onToggle(open: boolean): void
}

/** Controller returned by {@link createToolList}. */
export interface ToolList {
	/** The `<details>` element to place inside the server card. */
	element: HTMLDetailsElement
	/** Release the List.js adapter. Called before the node is discarded. */
	destroy(): void
}

/**
 * Build one tool `<li>`.
 *
 * Both `shortName` and `description` are server-supplied and therefore
 * untrusted: they reach the DOM through `textContent` and, for the search
 * index, `setAttribute` — never as parsed HTML.
 *
 * @param shortName - The bare remote tool name
 * @param description - The server-supplied description, possibly empty
 */
function toolItem(shortName: string, description: string): HTMLLIElement {
	return el("li", {
		className: "mcp-tool",
		data: { tool: shortName, description },
		children: [
			el("code", { text: shortName }),
			description ? el("span", { className: "mcp-tool-description", text: description }) : null,
		],
	})
}

/**
 * Render a server's discovered tools as a collapsible list, with a filter once
 * the list is long enough to need one.
 *
 * @param state - The server whose tools to render
 * @param options - Expansion state and toggle callback
 */
export function createToolList(state: McpServerState, options: ToolListOptions): ToolList {
	const count = state.tools.length
	const filterable = count > FILTER_THRESHOLD

	const list = el("ul", {
		// The `js-list` hook is only added when List.js is actually attached, so a
		// short list stays a plain, untouched `<ul>`.
		className: filterable ? "mcp-tool-list js-list" : "mcp-tool-list",
		children: state.tools.map((tool) => toolItem(tool.shortName, tool.description)),
	})

	const noMatches = el("p", {
		className: "mcp-empty mcp-tool-empty",
		text: "No tools match that filter.",
		attrs: { hidden: "" },
	})

	const search = filterable
		? el("input", {
				className: "js-search mcp-search",
				attrs: {
					type: "search",
					placeholder: "filter tools…",
					"aria-label": `Filter tools for ${state.serverName}`,
				},
			})
		: null

	const details = el("details", {
		className: "mcp-tools",
		children: [
			el("summary", { text: count === 1 ? "1 tool" : `${count} tools` }),
			search,
			list,
			filterable ? noMatches : null,
		],
	})
	details.open = options.expanded
	details.addEventListener("toggle", () => options.onToggle(details.open))

	let searchable: SearchableList | null = null
	if (filterable) {
		searchable = createSearchableList({
			root: details,
			keys: TOOL_INDEX_KEYS,
			onUpdate: (matching, total) => {
				noMatches.hidden = matching > 0 || total === 0
			},
		})
		searchable.sync()
	}

	return {
		element: details,
		destroy() {
			searchable?.destroy()
		},
	}
}
