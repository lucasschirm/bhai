/** @file The conversation stream: user bubbles, assistant turns, inline errors. */

import { el } from "../lib/dom.js"

/**
 * A handle on one in-flight assistant message.
 *
 * Replaces the old string-id handle: the caller holds the object and the
 * methods close over the message's own nodes, so nothing has to look the
 * element back up by id on every delta.
 */
export interface AssistantTurn {
	/** Append reasoning text to the collapsible Thought region. */
	appendThought(delta: string): void
	/** Append answer text to the message body. */
	appendAnswer(delta: string): void
}

/** Controller returned by {@link createConversationView}. */
export interface ConversationView {
	/** Add a user message bubble. */
	appendUserMessage(text: string): void
	/** Start a new assistant message and return a handle for streaming into it. */
	beginAssistantTurn(): AssistantTurn
	/** Show a non-fatal, per-turn error inline, leaving the composer usable. */
	showTurnError(message: string): void
	/** Remove the intro placeholder once the first turn begins. */
	clearEmptyState(): void
}

/**
 * Own the conversation column.
 *
 * NOT backed by List.js, deliberately: List.js re-parents every visible item on
 * each update, which on a token-by-token stream would thrash the DOM and fight
 * the `scrollTop` auto-scroll below.
 *
 * @param root - The scrolling conversation container
 * @param emptyState - The intro placeholder to remove on first use
 */
export function createConversationView(
	root: HTMLElement,
	emptyState: HTMLElement | null,
): ConversationView {
	/** Keep the newest content in view after every append. */
	function scrollToBottom(): void {
		root.scrollTop = root.scrollHeight
	}

	return {
		appendUserMessage(text) {
			root.appendChild(
				el("div", {
					className: "message user",
					children: [el("div", { className: "message-answer", text })],
				}),
			)
			scrollToBottom()
		},

		beginAssistantTurn() {
			const message = el("div", {
				className: "message assistant",
				children: [el("div", { className: "message-content" })],
			})
			root.appendChild(message)
			scrollToBottom()

			// Both regions are created on first use rather than up front, so a turn
			// with no reasoning never renders an empty Thought disclosure.
			let thought: HTMLElement | null = null
			let answer: HTMLElement | null = null

			return {
				appendThought(delta) {
					if (!thought) {
						const content = el("div", { className: "message-thought-content" })
						const details = el("details", {
							className: "message-thought",
							children: [
								el("summary", { text: "Thought" }),
								content,
								el("div", { className: "message-divider" }),
							],
						})
						// Collapsed by default; the user can toggle it open.
						details.open = false
						message.insertAdjacentElement("afterbegin", details)
						thought = content
					}
					thought.textContent += delta
					scrollToBottom()
				},

				appendAnswer(delta) {
					if (!answer) {
						answer = el("div", { className: "message-answer" })
						message.appendChild(answer)
					}
					answer.textContent += delta
					scrollToBottom()
				},
			}
		},

		showTurnError(message) {
			root.appendChild(
				el("div", {
					className: "message error",
					text: message,
					attrs: { role: "alert" },
				}),
			)
			scrollToBottom()
		},

		clearEmptyState() {
			emptyState?.remove()
		},
	}
}
