/**
 * @file One MCP server card.
 *
 * Every node here is built with `createElement` + `textContent`, and every
 * indexed value with `setAttribute`. That is not stylistic: the server name,
 * tool names, tool descriptions and error messages all originate from a remote
 * endpoint the user just pasted a URL for. They are untrusted input on the same
 * footing as model output, and `mcp-server-card.test.ts` guards it.
 */

import type { McpServerState } from "@lucasschirm/bhai/plugins/mcp"
import { el, iconButton } from "../lib/dom.js"

/**
 * The `data-*` keys each card carries for the server list's search and sort.
 * Exported so `mcp-server-list.ts` indexes exactly what the card writes.
 */
export const SERVER_INDEX_KEYS = ["name", "status", "tools"]

/** Card-level actions, delegated to whoever owns the `McpManager`. */
export interface McpCardHandlers {
	/** Re-poll the server's tool list. */
	onRefresh(id: string): void
	/** Re-attempt a failed connection. */
	onRetry(id: string): void
	/** Detach the server. */
	onRemove(id: string): void
	/** Open the error-details dialog. */
	onShowError(id: string): void
}

/** Human-readable status line per lifecycle state. */
const STATUS_LABEL: Record<string, string> = {
	connecting: "connecting…",
	connected: "connected",
	error: "failed",
	detached: "detached",
}

/**
 * The status line under the server name.
 *
 * @param state - The server snapshot to describe
 */
function statusText(state: McpServerState): string {
	const label = STATUS_LABEL[state.status] ?? state.status

	if (state.status === "connected") {
		// The tool count lives on the `<details>` summary below, so repeating it
		// here would say the same thing twice. Call out the empty case, which has
		// no summary to speak for it.
		return state.tools.length === 0 ? `${label} · no tools` : label
	}
	if (state.status === "error" && state.error) {
		// The name alone on this line; the full message is one click away in the
		// dialog. A 280px rail cannot show a stack trace usefully.
		return `${label} · ${state.error.name}`
	}
	return label
}

/**
 * The per-status action buttons.
 *
 * @param state - The server snapshot the buttons act on
 * @param handlers - Where the clicks go
 */
function actions(state: McpServerState, handlers: McpCardHandlers): HTMLElement {
	const buttons: HTMLButtonElement[] = []

	if (state.status === "connected") {
		buttons.push(
			iconButton("⟳", `Refresh tools for ${state.serverName}`, () => handlers.onRefresh(state.id)),
		)
	}
	if (state.status === "error") {
		buttons.push(
			iconButton("🐛", `Error details for ${state.serverName}`, () =>
				handlers.onShowError(state.id),
			),
			iconButton("↻", `Retry connecting to ${state.serverName}`, () => handlers.onRetry(state.id)),
		)
	}
	buttons.push(iconButton("✕", `Remove ${state.serverName}`, () => handlers.onRemove(state.id)))

	return el("div", { className: "mcp-actions", children: buttons })
}

/**
 * Render one server card.
 *
 * @param state - The server snapshot to render
 * @param handlers - Card-level actions
 * @param toolList - The tool disclosure to nest, or null when there is none.
 *   Injected rather than built here so the card stays free of List.js and of
 *   the tool list's teardown lifecycle.
 */
export function renderServerCard(
	state: McpServerState,
	handlers: McpCardHandlers,
	toolList: HTMLElement | null,
): HTMLLIElement {
	const name = el("span", {
		className: "mcp-server-name",
		text: state.serverName,
		attrs: { title: state.config.url },
	})

	return el("li", {
		className: "mcp-server",
		// `status` doubles as the CSS state hook and a search/sort key; `tools`
		// is indexed but never displayed, so typing a tool name finds the server
		// exposing it.
		data: {
			status: state.status,
			name: state.serverName,
			tools: state.tools.map((tool) => tool.shortName).join(" "),
		},
		children: [
			el("div", {
				className: "mcp-server-head",
				children: [
					el("span", { className: "status-dot", data: { state: state.status } }),
					name,
					actions(state, handlers),
				],
			}),
			el("div", { className: "mcp-server-status", text: statusText(state) }),
			toolList,
		],
	})
}
