/** @file The MCP panel's "Add HTTP server" form. */

import { byId } from "../lib/dom.js"

/** Raw field values, unvalidated — parsing lives in `lib/mcp-store.ts`. */
export interface McpFormValues {
	/** The endpoint URL as typed. */
	url: string
	/** The optional BHAI-local server name as typed. */
	name: string
	/** The raw headers textarea contents, one `Key: Value` per line. */
	headersText: string
}

/** Controller returned by {@link createMcpAddForm}. */
export interface McpAddForm {
	/** Read the current field values. */
	values(): McpFormValues
	/** Disable the fields and relabel the submit button while connecting. */
	setBusy(busy: boolean): void
	/** Show a validation or connection error above the submit button. */
	showError(message: string): void
	/** Clear the error line. */
	clearError(): void
	/** Clear the fields and collapse the disclosure. */
	reset(): void
	/** Register the submit handler. Called once, after the controllers exist. */
	onSubmit(handler: () => void): void
}

/** Ids of the inputs whose disabled state moves together. */
const FIELD_IDS = ["mcp-url", "mcp-name", "mcp-headers"]

/**
 * Own the add-server form.
 *
 * @param details - The `<details>` disclosure wrapping the form
 * @param form - The form itself
 */
export function createMcpAddForm(details: HTMLDetailsElement, form: HTMLFormElement): McpAddForm {
	const url = byId<HTMLInputElement>("mcp-url", form)
	const name = byId<HTMLInputElement>("mcp-name", form)
	const headers = byId<HTMLTextAreaElement>("mcp-headers", form)
	const submit = byId<HTMLButtonElement>("mcp-add-submit", form)
	const error = byId("mcp-add-error", form)

	return {
		values() {
			return { url: url.value, name: name.value, headersText: headers.value }
		},

		setBusy(busy) {
			submit.disabled = busy
			submit.textContent = busy ? "Connecting…" : "Connect"
			for (const id of FIELD_IDS) {
				byId<HTMLInputElement>(id, form).disabled = busy
			}
		},

		showError(message) {
			error.textContent = message
			error.hidden = false
		},

		clearError() {
			error.textContent = ""
			error.hidden = true
		},

		reset() {
			form.reset()
			error.textContent = ""
			error.hidden = true
			details.open = false
		},

		onSubmit(handler) {
			form.addEventListener("submit", (event) => {
				event.preventDefault()
				handler()
			})
		},
	}
}
