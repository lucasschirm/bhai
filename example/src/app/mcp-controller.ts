/**
 * @file MCP orchestration: manager subscription, the add-server form, and
 * persistence.
 *
 * The panel is a pure reflection of `McpManager` state — this module subscribes
 * once and re-renders the whole list on every transition. Nothing about a
 * server is tracked separately, including the persisted list, which is derived
 * from `manager.list()` on write so storage cannot drift from the screen.
 */

import type { McpManager } from "@lucasschirm/bhai/plugins/mcp"

import type { McpAddForm } from "../components/mcp-add-form.js"
import type { McpErrorDialog } from "../components/mcp-error-dialog.js"
import type { McpCardHandlers } from "../components/mcp-server-card.js"
import type { McpServerList } from "../components/mcp-server-list.js"
import { loadServers, parseHeaderLines, saveServers, validateServerUrl } from "../lib/mcp-store.js"

/** Everything the MCP controller drives. */
export interface McpControllerDeps {
	/** The manager handed back by `createMcpPlugin()`. */
	manager: McpManager
	/**
	 * Build the server list, bound to this controller's card handlers.
	 *
	 * A factory rather than a ready-made list because the two are mutually
	 * dependent: the list needs handlers that only exist once the controller is
	 * built, and the controller needs a list to render into.
	 */
	createList(handlers: McpCardHandlers): McpServerList
	/** The add-server form. */
	form: McpAddForm
	/** The error-details dialog. */
	dialog: McpErrorDialog
}

/** Controller returned by {@link createMcpController}. */
export interface McpController {
	/** Subscribe the panel, wire the form, and reconnect saved servers. */
	start(): Promise<void>
}

/**
 * Wire the MCP manager to the MCP panel.
 *
 * @param deps - The manager, the list factory, and the component controllers
 */
export function createMcpController(deps: McpControllerDeps): McpController {
	const { manager, form, dialog } = deps

	/**
	 * Persist the current server list.
	 *
	 * Errored entries are kept: the user asked for that server, and a failure is
	 * usually transient (server not started yet, token expired). Dropping it
	 * would silently discard their input.
	 */
	function persist(): void {
		saveServers(
			manager.list().map((state) => ({
				url: state.config.url,
				name: state.config.name,
				headers: state.config.headers,
			})),
		)
	}

	/** Validate the add-server form and attach the server. */
	async function submit(): Promise<void> {
		const { url, name, headersText } = form.values()

		const urlError = validateServerUrl(url)
		if (urlError) {
			form.showError(urlError)
			return
		}

		const { headers, errors } = parseHeaderLines(headersText)
		if (errors.length > 0) {
			form.showError(errors.join(" "))
			return
		}

		form.clearError()
		form.setBusy(true)

		try {
			const trimmedName = name.trim()
			const state = await manager.add({
				url: url.trim(),
				...(trimmedName ? { name: trimmedName } : {}),
				...(Object.keys(headers).length > 0 ? { headers } : {}),
			})

			persist()

			if (state.status === "connected") {
				// Only clear on success: a failed attempt usually needs a small edit
				// (a typo in the path, a stale token), and wiping the fields would
				// make the user retype all of it.
				form.reset()
			} else {
				form.showError(
					`${state.error?.name ?? "Error"}: ${state.error?.message ?? "connection failed"}`,
				)
			}
		} finally {
			form.setBusy(false)
		}
	}

	const handlers: McpCardHandlers = {
		onRefresh: (id) => {
			void manager.refresh(id)
		},
		onRetry: (id) => {
			void manager.retry(id)
		},
		onRemove: (id) => {
			void (async () => {
				try {
					await manager.remove(id)
					persist()
				} catch (error) {
					console.error("Failed to remove MCP server:", error)
				}
			})()
		},
		onShowError: (id) => {
			const state = manager.get(id)
			if (state?.error) dialog.show(state.error)
		},
	}

	const list = deps.createList(handlers)

	return {
		async start() {
			// Every transition re-renders, including the `connecting` one that fires
			// before the network call.
			manager.subscribe((states) => list.render(states))
			list.render(manager.list())

			form.onSubmit(() => void submit())

			// Restore saved servers one at a time. Sequential rather than concurrent
			// so the panel fills top-down in a readable order; a failure becomes an
			// error card and never blocks the servers behind it.
			for (const saved of loadServers()) {
				await manager.add(saved)
			}
		},
	}
}
