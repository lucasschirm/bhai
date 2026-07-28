/** @file The footer composer: textarea + Send/Stop button. */

/** Whether a turn is in flight. */
export type ComposerState = "idle" | "generating"

/** What the composer reports upward. */
export interface ComposerHandlers {
	/** The user submitted a non-empty message. */
	onSend(text: string): void
	/** The user pressed Stop during generation. */
	onStop(): void
}

/** Controller returned by {@link createComposer}. */
export interface Composer {
	/** Toggle between the idle (Send) and generating (Stop) presentations. */
	setState(state: ComposerState): void
	/** Empty the textarea. */
	clear(): void
	/** Hide the composer entirely — used when a fatal error blocks interaction. */
	hide(): void
	/** Attach the send/stop handlers. Called once, after the controllers exist. */
	wire(handlers: ComposerHandlers): void
}

/**
 * Own the composer footer.
 *
 * The Send button stays ENABLED during generation (relabelled "Stop") — an
 * earlier version disabled it, which made the cancel affordance unclickable.
 * Only the textarea is disabled mid-turn.
 *
 * @param root - The `<footer>` wrapping the composer
 * @param input - The message textarea
 * @param button - The Send/Stop button
 */
export function createComposer(
	root: HTMLElement,
	input: HTMLTextAreaElement,
	button: HTMLButtonElement,
): Composer {
	/** Read and trim the textarea, or null when there is nothing to send. */
	function pendingText(): string | null {
		const text = input.value.trim()
		return text === "" ? null : text
	}

	return {
		setState(state) {
			const generating = state === "generating"
			input.disabled = generating
			button.disabled = false
			button.dataset.state = generating ? "stop" : "send"
			button.textContent = generating ? "Stop" : "Send"
		},

		clear() {
			input.value = ""
		},

		hide() {
			root.style.display = "none"
		},

		wire(handlers) {
			button.addEventListener("click", () => {
				if (button.dataset.state === "stop") {
					handlers.onStop()
					return
				}
				const text = pendingText()
				if (text) handlers.onSend(text)
			})

			input.addEventListener("keydown", (event) => {
				// Enter without Shift sends; Shift+Enter keeps its newline.
				if (event.key !== "Enter" || event.shiftKey) return
				event.preventDefault()
				const text = pendingText()
				if (text) handlers.onSend(text)
			})
		},
	}
}
