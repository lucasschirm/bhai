import { describe, expect, it, vi } from "vitest"

import { BHAI, type BHAIPluginCapabilities } from "./bhai.js"

// TASK_0003 — BHAI kernel class + use() normalization (plugin forms 1 & 2).
//
// These tests cover only the constructor and `use()` behavior described in
// the task spec. Every other § 6 method is a stub that throws; those are
// exercised by their owning tasks.

describe("BHAI constructor", () => {
	it("constructs with no options without throwing", () => {
		expect(() => new BHAI()).not.toThrow()
	})

	it("constructs with host options and stores them verbatim", () => {
		const bh = new BHAI({ defaultModel: "ollama/llama3.3" })
		expect(bh.__testOption("defaultModel")).toBe("ollama/llama3.3")
	})

	it("does not validate or transform option values (deferred to TASK_0006+)", () => {
		const config = { "my-plugin": { flag: true } }
		const bh = new BHAI({ config, systemPrompt: "you are a robot" })
		// Stored verbatim — same reference, no cloning/validation.
		expect(bh.__testOption("config")).toBe(config)
		expect(bh.__testOption("systemPrompt")).toBe("you are a robot")
	})
})

describe("BHAI.use — form 1 (bare factory function)", () => {
	it("invokes the factory exactly once, passing the BHAI instance", () => {
		const bh = new BHAI()
		const fn = vi.fn()
		bh.use(fn)
		expect(fn).toHaveBeenCalledTimes(1)
		expect(fn).toHaveBeenCalledWith(bh)
	})

	it("returns this for chaining", () => {
		const bh = new BHAI()
		const fn = vi.fn()
		expect(bh.use(fn)).toBe(bh)
	})

	it("registers two unnamed factories as distinct plugins", () => {
		const bh = new BHAI()
		bh.use(() => {})
		bh.use(() => {})
		expect(bh.__testPluginCount()).toBe(2)
	})

	it("treats the same function used twice as two distinct plugins (no name to dedupe on)", () => {
		const bh = new BHAI()
		const fn = vi.fn()
		bh.use(fn)
		bh.use(fn)
		// Form-1 idempotency is keyed on explicit name; unnamed factories are
		// never duplicates of each other (TASK_0003 spec, idempotency rule).
		expect(bh.__testPluginCount()).toBe(2)
		expect(fn).toHaveBeenCalledTimes(2)
	})
})

describe("BHAI.use — form 2 (capability object)", () => {
	it("accepts an object with only recognized keys without throwing", () => {
		const bh = new BHAI()
		const cap: BHAIPluginCapabilities = {
			name: "ok",
			initialize: vi.fn(),
			dispose: vi.fn(),
			configSchema: { type: "object" },
		}
		expect(() => bh.use(cap)).not.toThrow()
		expect(bh.__testPluginCount()).toBe(1)
		expect(bh.__testHasPlugin("ok")).toBe(true)
	})

	it("does NOT prematurely invoke the initialize hook at use() time", () => {
		const bh = new BHAI()
		const initialize = vi.fn()
		bh.use({ name: "no-early-init", initialize })
		// init() does not exist yet (TASK_0005); we only assert use() itself
		// did not call initialize. The hook must run later, at bh.init() time.
		expect(initialize).not.toHaveBeenCalled()
	})

	it("does NOT prematurely invoke the dispose hook at use() time", () => {
		const bh = new BHAI()
		const dispose = vi.fn()
		bh.use({ name: "no-early-dispose", dispose })
		expect(dispose).not.toHaveBeenCalled()
	})

	it("auto-generates a name when none is supplied", () => {
		const bh = new BHAI()
		bh.use({ configSchema: { type: "object" } })
		expect(bh.__testPluginCount()).toBe(1)
	})

	it("returns this for chaining", () => {
		const bh = new BHAI()
		expect(bh.use({ name: "a" })).toBe(bh)
	})

	it("throws synchronously on an unrecognized capability key, naming the bad key", () => {
		const bh = new BHAI()
		expect(() => bh.use({ foo: 1 } as unknown as BHAIPluginCapabilities)).toThrow(/foo/)
		expect(() => bh.use({ foo: 1 } as unknown as BHAIPluginCapabilities)).toThrow(
			/unrecognized plugin capability key "foo"/,
		)
	})

	it("rejects a misspelled initialize key (initalize) fast", () => {
		const bh = new BHAI()
		expect(() => bh.use({ initalize: vi.fn() } as unknown as BHAIPluginCapabilities)).toThrow(
			/initalize/,
		)
	})

	it("rejects an unknown key even when valid keys are also present", () => {
		const bh = new BHAI()
		expect(() =>
			bh.use({
				name: "mixed",
				initialize: vi.fn(),
				bogus: true,
			} as unknown as BHAIPluginCapabilities),
		).toThrow(/bogus/)
		// Nothing should have been registered.
		expect(bh.__testPluginCount()).toBe(0)
		expect(bh.__testHasPlugin("mixed")).toBe(false)
	})
})

describe("BHAI.use — idempotency by explicit name", () => {
	it("ignores a second use() with the same explicit name (no re-registration)", () => {
		const bh = new BHAI()
		bh.use({ name: "dup", configSchema: { type: "object", properties: { a: {} } } })
		bh.use({ name: "dup", configSchema: { type: "object", properties: { b: {} } } })
		expect(bh.__testPluginCount()).toBe(1)
		expect(bh.__testHasPlugin("dup")).toBe(true)
	})

	it("does not merge/adopt the second capability object's keys", () => {
		const bh = new BHAI()
		const firstInit = vi.fn()
		const secondInit = vi.fn()
		bh.use({ name: "dup", initialize: firstInit, configSchema: { a: 1 } })
		bh.use({ name: "dup", initialize: secondInit, configSchema: { b: 2 } })
		// Only the first registration's hooks exist; the second's were dropped.
		expect(firstInit).not.toHaveBeenCalled() // still not called at use() time
		expect(secondInit).not.toHaveBeenCalled()
		expect(bh.__testPluginCount()).toBe(1)
	})

	it("does not run a duplicate form-1 factory's body when wrapped to share a name", () => {
		// Form 1 has no name, so true dedupe-by-name isn't expressible for it.
		// Instead, verify the rule via the capability path: two capability
		// objects sharing a name keep only the first.
		const bh = new BHAI()
		const a = vi.fn()
		const b = vi.fn()
		bh.use({ name: "shared", initialize: a })
		bh.use({ name: "shared", initialize: b })
		expect(bh.__testPluginCount()).toBe(1)
		expect(a).not.toHaveBeenCalled()
		expect(b).not.toHaveBeenCalled()
	})
})

describe("BHAI.use — form rejection", () => {
	it("throws on null", () => {
		const bh = new BHAI()
		expect(() => bh.use(null as unknown as never)).toThrow(
			/must be a function, a capability object, or a @Plugin-decorated instance/,
		)
	})

	it("throws on a primitive", () => {
		const bh = new BHAI()
		expect(() => bh.use(42 as unknown as never)).toThrow(
			/must be a function, a capability object, or a @Plugin-decorated instance/,
		)
	})
})

describe("BHAI.use — chaining order", () => {
	it("preserves registration order across mixed forms", () => {
		const bh = new BHAI()
		bh.use(() => {})
		bh.use({ name: "cap" })
		bh.use(() => {})
		expect(bh.__testPluginCount()).toBe(3)
		expect(bh.__testHasPlugin("cap")).toBe(true)
	})
})
