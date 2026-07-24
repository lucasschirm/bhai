import { describe, expect, it } from "vitest"
import { Conversation } from "../../src/conversation/system-prompt"

describe("Conversation system-prompt resolution", () => {
	it("uses the base prompt when no handlers are registered", () => {
		const conversation = new Conversation("base")
		expect(conversation.systemPrompt).toBe("base")
	})

	it("a single handler can replace the system prompt", () => {
		const conversation = new Conversation("base")
		conversation.onStart(() => ({ systemPrompt: "X" }))
		expect(conversation.systemPrompt).toBe("X")
	})

	it("a single handler can append to the system prompt", () => {
		const conversation = new Conversation("base")
		conversation.onStart(() => ({ appendSystemPrompt: "Y" }))
		expect(conversation.systemPrompt).toBe("base\n\nY")
	})

	it("a single patch applies replace before append", () => {
		const conversation = new Conversation("base")
		conversation.onStart(() => ({ systemPrompt: "X", appendSystemPrompt: "Y" }))
		expect(conversation.systemPrompt).toBe("X\n\nY")
	})

	// The bug from issue #4: replace-then-append across two independent handlers.
	// A shallow-merged patch object would collapse to { systemPrompt: "X",
	// appendSystemPrompt: "Y" } and silently drop the append, yielding "X".
	it("replace handler then append handler chains to X\\n\\nY", () => {
		const conversation = new Conversation("base")
		conversation.onStart(() => ({ systemPrompt: "X" }))
		conversation.onStart(() => ({ appendSystemPrompt: "Y" }))
		expect(conversation.systemPrompt).toBe("X\n\nY")
	})

	// The reverse order: a later replace discards earlier accumulated appends.
	it("append handler then replace handler resolves to the replacement", () => {
		const conversation = new Conversation("base")
		conversation.onStart(() => ({ appendSystemPrompt: "Y" }))
		conversation.onStart(() => ({ systemPrompt: "X" }))
		expect(conversation.systemPrompt).toBe("X")
	})

	it("multiple append handlers accumulate in registration order", () => {
		const conversation = new Conversation("base")
		conversation.onStart(() => ({ appendSystemPrompt: "A" }))
		conversation.onStart(() => ({ appendSystemPrompt: "B" }))
		expect(conversation.systemPrompt).toBe("base\n\nA\n\nB")
	})

	it("a handler reads the running value left by the previous handler", () => {
		const conversation = new Conversation("base")
		const seen: string[] = []
		conversation.onStart(() => ({ systemPrompt: "X" }))
		conversation.onStart((current) => {
			seen.push(current.systemPrompt)
			return { appendSystemPrompt: "Y" }
		})
		expect(conversation.systemPrompt).toBe("X\n\nY")
		expect(seen).toEqual(["X"])
	})

	it("a handler returning nothing leaves the running value untouched", () => {
		const conversation = new Conversation("base")
		conversation.onStart(() => ({ systemPrompt: "X" }))
		conversation.onStart(() => undefined)
		expect(conversation.systemPrompt).toBe("X")
	})

	it("prepend lines accumulate with the latest handler at the front", () => {
		const conversation = new Conversation("base")
		conversation.onStart(() => ({ prepend: ["a"] }))
		conversation.onStart(() => ({ prepend: ["b"] }))
		expect(conversation.prepend).toEqual(["b", "a"])
	})

	it("prepend accumulates independently of system-prompt replacement", () => {
		const conversation = new Conversation("base")
		conversation.onStart(() => ({ prepend: ["a"], systemPrompt: "X" }))
		conversation.onStart(() => ({ prepend: ["b"], appendSystemPrompt: "Y" }))
		expect(conversation.systemPrompt).toBe("X\n\nY")
		expect(conversation.prepend).toEqual(["b", "a"])
	})

	it("resolution is cached and handlers run only once", () => {
		const conversation = new Conversation("base")
		let calls = 0
		conversation.onStart(() => {
			calls += 1
			return { appendSystemPrompt: "Y" }
		})
		expect(conversation.ensureStarted()).toBe(conversation.ensureStarted())
		expect(conversation.systemPrompt).toBe("base\n\nY")
		expect(calls).toBe(1)
	})
})
