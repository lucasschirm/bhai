/** @file The native `<dialog>` inspector for a failed MCP connection. */

import type { McpServerError } from "@lucasschirm/bhai/plugins/mcp"
import { byId } from "../lib/dom.js"
import { errorHint } from "../lib/mcp-store.js"

/** Controller returned by {@link createMcpErrorDialog}. */
export interface McpErrorDialog {
	/** Open the dialog populated with one server's captured error. */
	show(error: McpServerError): void
	/** Close the dialog. */
	hide(): void
}

/**
 * Own the error-details dialog.
 *
 * Uses the native `<dialog>` `showModal()`, which brings a focus trap, an inert
 * backdrop, and Esc-to-close for free — all things a hand-rolled overlay would
 * have to reimplement and usually gets wrong.
 *
 * @param dialog - The `<dialog>` element
 * @param closeButton - Its close affordance
 */
export function createMcpErrorDialog(
	dialog: HTMLDialogElement,
	closeButton: HTMLButtonElement,
): McpErrorDialog {
	const name = byId("mcp-error-name", dialog)
	const url = byId("mcp-error-url", dialog)
	const time = byId("mcp-error-time", dialog)
	const message = byId("mcp-error-message", dialog)
	const hint = byId("mcp-error-hint", dialog)
	const stackWrap = byId("mcp-error-stack-wrap", dialog)
	const stack = byId("mcp-error-stack", dialog)

	const controller: McpErrorDialog = {
		show(error) {
			// Every field below is remote text; `textContent` throughout.
			name.textContent = error.name
			url.textContent = error.url
			time.textContent = new Date(error.at).toLocaleTimeString()
			message.textContent = error.message

			const explanation = errorHint(error)
			hint.textContent = explanation ?? ""
			hint.hidden = explanation === null

			stackWrap.hidden = !error.stack
			stack.textContent = error.stack ?? ""

			dialog.showModal()
		},

		hide() {
			dialog.close()
		},
	}

	closeButton.addEventListener("click", () => controller.hide())

	return controller
}
