/** @file The statusbar's dot + label. */

/** Lifecycle states the dot renders, via its `data-state` attribute. */
export type StatusState = "cold" | "warming" | "ready" | "generating"

/** Controller returned by {@link createStatusIndicator}. */
export interface StatusIndicator {
	/** Set the dot's state and the text beside it. */
	set(state: StatusState, label: string): void
}

/**
 * Own the status dot and its label.
 *
 * @param dot - The element whose `data-state` drives the dot's color/animation
 * @param label - The element holding the human-readable state
 */
export function createStatusIndicator(dot: HTMLElement, label: HTMLElement): StatusIndicator {
	return {
		set(state, text) {
			dot.dataset.state = state
			label.textContent = text
		},
	}
}
