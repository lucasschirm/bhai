// @vitest-environment happy-dom

import { beforeEach, describe, expect, it } from "vitest"
import { createConversationView } from "./conversation-view.js"

/** Build the conversation column with its intro placeholder. */
function fixture(): { root: HTMLElement; emptyState: HTMLElement } {
	document.body.innerHTML = `
		<section id="conversation">
			<div class="empty-state" id="empty-state">No model loaded.</div>
		</section>
	`
	return {
		root: document.getElementById("conversation") as HTMLElement,
		emptyState: document.getElementById("empty-state") as HTMLElement,
	}
}

describe("createConversationView", () => {
	beforeEach(() => {
		document.body.innerHTML = ""
	})

	it("renders a user message as text, not markup", () => {
		const { root, emptyState } = fixture()
		const view = createConversationView(root, emptyState)

		view.appendUserMessage("<b>hello</b>")

		const bubble = root.querySelector(".message.user .message-answer") as HTMLElement
		expect(bubble.textContent).toBe("<b>hello</b>")
		expect(bubble.querySelector("b")).toBeNull()
	})

	it("routes thought and answer deltas to separate regions", () => {
		const { root, emptyState } = fixture()
		const view = createConversationView(root, emptyState)

		const turn = view.beginAssistantTurn()
		turn.appendThought("weigh")
		turn.appendThought("ing…")
		turn.appendAnswer("Hel")
		turn.appendAnswer("lo.")

		const message = root.querySelector(".message.assistant") as HTMLElement
		expect(message.querySelector(".message-thought-content")?.textContent).toBe("weighing…")
		expect(message.querySelector(".message-answer")?.textContent).toBe("Hello.")
	})

	it("creates the Thought disclosure only when reasoning actually arrives", () => {
		const { root, emptyState } = fixture()
		const view = createConversationView(root, emptyState)

		const turn = view.beginAssistantTurn()
		turn.appendAnswer("no reasoning here")

		expect(root.querySelector(".message-thought")).toBeNull()
	})

	it("collapses the Thought disclosure by default", () => {
		const { root, emptyState } = fixture()
		const view = createConversationView(root, emptyState)

		view.beginAssistantTurn().appendThought("hmm")

		expect((root.querySelector(".message-thought") as HTMLDetailsElement).open).toBe(false)
	})

	it("keeps concurrent turns independent", () => {
		// Each turn closes over its own nodes rather than looking a message back up
		// by id, so a second turn cannot stream into the first.
		const { root, emptyState } = fixture()
		const view = createConversationView(root, emptyState)

		const first = view.beginAssistantTurn()
		const second = view.beginAssistantTurn()
		first.appendAnswer("one")
		second.appendAnswer("two")

		const answers = Array.from(root.querySelectorAll(".message.assistant .message-answer")).map(
			(node) => node.textContent,
		)
		expect(answers).toEqual(["one", "two"])
	})

	it("shows a turn error as an alert without touching earlier messages", () => {
		const { root, emptyState } = fixture()
		const view = createConversationView(root, emptyState)

		view.appendUserMessage("hi")
		view.showTurnError("Failed to generate a response: boom")

		const error = root.querySelector(".message.error") as HTMLElement
		expect(error.getAttribute("role")).toBe("alert")
		expect(error.textContent).toBe("Failed to generate a response: boom")
		expect(root.querySelector(".message.user")).not.toBeNull()
	})

	it("removes the empty state on request, and tolerates being asked twice", () => {
		const { root, emptyState } = fixture()
		const view = createConversationView(root, emptyState)

		view.clearEmptyState()
		expect(document.getElementById("empty-state")).toBeNull()
		expect(() => view.clearEmptyState()).not.toThrow()
	})

	it("tolerates a missing empty state", () => {
		document.body.innerHTML = '<section id="conversation"></section>'
		const root = document.getElementById("conversation") as HTMLElement
		const view = createConversationView(root, null)

		expect(() => view.clearEmptyState()).not.toThrow()
	})
})
