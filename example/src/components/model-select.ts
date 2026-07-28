/** @file The statusbar's model picker. */

import { el } from "../lib/dom.js"

/** Controller returned by {@link createModelSelect}. */
export interface ModelSelect {
	/** Replace the options and pre-select one of them. */
	populate(modelIds: string[], selectedId: string): void
	/** The currently selected model id, or null when nothing is selected. */
	selectedId(): string | null
	/** Register the handler run when the user picks a different model. */
	onChange(handler: (modelId: string) => void): void
}

/**
 * Own the `<select>` of model ids.
 *
 * Stays a native `<select>` rather than becoming a List.js-backed dropdown:
 * the allowlist is five entries and the platform control already brings
 * keyboard type-ahead, mobile pickers, and form semantics for free.
 *
 * @param select - The `<select>` element to own
 */
export function createModelSelect(select: HTMLSelectElement): ModelSelect {
	return {
		populate(modelIds, selectedId) {
			select.replaceChildren(
				...modelIds.map((id) => el("option", { text: id, attrs: { value: id } })),
			)
			if (selectedId) {
				select.value = selectedId
			}
		},

		selectedId() {
			return select.value || null
		},

		onChange(handler) {
			select.addEventListener("change", () => {
				handler(select.value)
			})
		},
	}
}
