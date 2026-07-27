import { describe, expect, it } from "vitest"
import { Conversation, type PluginActivationSource } from "./system-prompt.js"

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

// ---------------------------------------------------------------------------
// Per-conversation plugin activation.
// ---------------------------------------------------------------------------

/**
 * Minimal stand-in for the kernel. `Conversation` depends on the structural
 * `PluginActivationSource` interface rather than on `BHAI`, so the test can
 * supply the two methods directly instead of booting a kernel.
 */
function fakeKernel(disabled: string[] = [], names = ["alpha", "beta"]): PluginActivationSource {
	const off = new Set(disabled)
	return {
		isPluginEnabled: (name) => names.includes(name) && !off.has(name),
		listPlugins: () => names.map((name) => ({ name })),
	}
}

describe("Conversation plugin activation", () => {
	it("runs an owned handler when its plugin is globally enabled", () => {
		const conversation = new Conversation("base", { bhai: fakeKernel() })
		conversation.onStart(() => ({ appendSystemPrompt: "A" }), "alpha")
		expect(conversation.systemPrompt).toBe("base\n\nA")
	})

	it("skips an owned handler when its plugin is globally disabled", () => {
		const conversation = new Conversation("base", { bhai: fakeKernel(["alpha"]) })
		conversation.onStart(() => ({ appendSystemPrompt: "A" }), "alpha")
		expect(conversation.systemPrompt).toBe("base")
	})

	it("a conversation override can disable a globally-enabled plugin", () => {
		const conversation = new Conversation("base", { bhai: fakeKernel() })
		conversation.onStart(() => ({ appendSystemPrompt: "A" }), "alpha")
		conversation.disablePlugin("alpha")
		expect(conversation.systemPrompt).toBe("base")
	})

	it("a conversation override can enable a globally-disabled plugin", () => {
		const conversation = new Conversation("base", { bhai: fakeKernel(["alpha"]) })
		conversation.onStart(() => ({ appendSystemPrompt: "A" }), "alpha")
		conversation.enablePlugin("alpha")
		expect(conversation.systemPrompt).toBe("base\n\nA")
	})

	it("overrides are per conversation, not shared", () => {
		const kernel = fakeKernel()
		const a = new Conversation("base", { bhai: kernel })
		const b = new Conversation("base", { bhai: kernel })
		a.onStart(() => ({ appendSystemPrompt: "A" }), "alpha")
		b.onStart(() => ({ appendSystemPrompt: "A" }), "alpha")
		a.disablePlugin("alpha")
		expect(a.systemPrompt).toBe("base")
		expect(b.systemPrompt).toBe("base\n\nA")
	})

	it("resetPlugin returns an overridden plugin to inheriting the global state", () => {
		const conversation = new Conversation("base", { bhai: fakeKernel(["alpha"]) })
		conversation.enablePlugin("alpha")
		expect(conversation.isPluginEnabled("alpha")).toBe(true)
		conversation.resetPlugin("alpha")
		expect(conversation.isPluginEnabled("alpha")).toBe(false)
	})

	it("unowned handlers always run, whatever is disabled", () => {
		const conversation = new Conversation("base", { bhai: fakeKernel(["alpha"]) })
		conversation.disablePlugin("beta")
		conversation.onStart(() => ({ appendSystemPrompt: "H" }))
		expect(conversation.systemPrompt).toBe("base\n\nH")
	})

	it("a skipped handler leaves the running value untouched for the next handler", () => {
		const conversation = new Conversation("base", { bhai: fakeKernel(["alpha"]) })
		conversation.onStart(() => ({ systemPrompt: "REPLACED" }), "alpha")
		conversation.onStart(() => ({ appendSystemPrompt: "B" }), "beta")
		expect(conversation.systemPrompt).toBe("base\n\nB")
	})

	it("toggling after the conversation has started does not change the resolved prompt", () => {
		const conversation = new Conversation("base", { bhai: fakeKernel() })
		conversation.onStart(() => ({ appendSystemPrompt: "A" }), "alpha")
		expect(conversation.systemPrompt).toBe("base\n\nA")
		conversation.disablePlugin("alpha")
		expect(conversation.systemPrompt).toBe("base\n\nA")
	})

	it("restart() re-resolves against the current activation state", () => {
		const conversation = new Conversation("base", { bhai: fakeKernel() })
		conversation.onStart(() => ({ appendSystemPrompt: "A" }), "alpha")
		expect(conversation.systemPrompt).toBe("base\n\nA")
		conversation.disablePlugin("alpha")
		conversation.restart()
		expect(conversation.systemPrompt).toBe("base")
		conversation.enablePlugin("alpha")
		conversation.restart()
		expect(conversation.systemPrompt).toBe("base\n\nA")
	})

	it("listPlugins reports global state, override and effective state", () => {
		const conversation = new Conversation("base", { bhai: fakeKernel(["beta"]) })
		conversation.disablePlugin("alpha")
		expect(conversation.listPlugins()).toEqual([
			{ name: "alpha", globalEnabled: true, override: false, effective: false },
			{ name: "beta", globalEnabled: false, override: undefined, effective: false },
		])
	})

	it("a conversation with no kernel gates nothing and lists nothing", () => {
		const conversation = new Conversation("base")
		conversation.onStart(() => ({ appendSystemPrompt: "A" }), "alpha")
		expect(conversation.systemPrompt).toBe("base\n\nA")
		expect(conversation.isPluginEnabled("alpha")).toBe(true)
		expect(conversation.listPlugins()).toEqual([])
	})

	it("a conversation with no kernel still honors its own overrides", () => {
		const conversation = new Conversation("base")
		conversation.disablePlugin("alpha")
		conversation.onStart(() => ({ appendSystemPrompt: "A" }), "alpha")
		expect(conversation.systemPrompt).toBe("base")
	})

	it("the activation methods return this for chaining", () => {
		const conversation = new Conversation("base")
		expect(conversation.disablePlugin("a")).toBe(conversation)
		expect(conversation.enablePlugin("a")).toBe(conversation)
		expect(conversation.resetPlugin("a")).toBe(conversation)
	})
})
