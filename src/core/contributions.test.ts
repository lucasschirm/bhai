// @file Tests for BHAI.getContributions() — generic multi-plugin accessor.
// TASK_0034: verifies that the method retrieves contributions in registration order,
// handles unregistered keys gracefully, and preserves falsy-but-defined values.

import { describe, expect, it } from "vitest"
import { BHAI } from "./bhai.js"

describe("BHAI.getContributions()", () => {
	it("retrieves two plugins contributing under the same key, in order", () => {
		const bh = new BHAI()
		const mockRetrieverA = { name: "a", search: () => [] }
		const mockRetrieverB = { name: "b", search: () => [] }

		bh.use({ retriever: mockRetrieverA })
		bh.use({ retriever: mockRetrieverB })

		const results = bh.getContributions("retriever")

		expect(results).toHaveLength(2)
		expect(results[0]).toBe(mockRetrieverA)
		expect(results[1]).toBe(mockRetrieverB)
		expect(results).toEqual([mockRetrieverA, mockRetrieverB])
	})

	it("returns empty array for unregistered key", () => {
		const bh = new BHAI()
		const mockRetrieverA = { name: "a" }
		const mockRetrieverB = { name: "b" }

		bh.use({ retriever: mockRetrieverA })
		bh.use({ retriever: mockRetrieverB })

		const results = bh.getContributions("nonexistent-key")

		expect(Array.isArray(results)).toBe(true)
		expect(results.length).toBe(0)
		expect(results).not.toBe(undefined)
		expect(results).toEqual([])
	})

	it("preserves registration order with interleaved non-contributing plugin", () => {
		const bh = new BHAI()
		const mockRetrieverA = { name: "a" }
		const mockRetrieverB = { name: "b" }

		bh.use({ retriever: mockRetrieverA })
		bh.use({ initialize: () => {} }) // contributes nothing under 'retriever'
		bh.use({ retriever: mockRetrieverB })

		const results = bh.getContributions("retriever")

		expect(results).toHaveLength(2)
		expect(results[0]).toBe(mockRetrieverA)
		expect(results[1]).toBe(mockRetrieverB)
	})

	it("silently skips factory-form (form-1) plugins", () => {
		const bh = new BHAI()
		const mockRetrieverA = { name: "a" }
		const mockRetrieverB = { name: "b" }

		bh.use((bh) => {}) // bare factory — has no capabilities
		bh.use({ retriever: mockRetrieverA })
		bh.use((bh) => {}) // another bare factory
		bh.use({ retriever: mockRetrieverB })

		const results = bh.getContributions("retriever")

		expect(results).toHaveLength(2)
		expect(results[0]).toBe(mockRetrieverA)
		expect(results[1]).toBe(mockRetrieverB)
	})

	it("works identically for arbitrary non-retriever keys (genericity)", () => {
		const bh = new BHAI()
		const mockSkillResolverA = { name: "skillA", resolve: () => undefined }
		const mockSkillResolverB = { name: "skillB", resolve: () => undefined }

		bh.use({ skillResolver: mockSkillResolverA })
		bh.use({ skillResolver: mockSkillResolverB })

		const results = bh.getContributions("skillResolver")

		expect(results).toHaveLength(2)
		expect(results[0]).toBe(mockSkillResolverA)
		expect(results[1]).toBe(mockSkillResolverB)
		expect(results).toEqual([mockSkillResolverA, mockSkillResolverB])
	})

	it("includes falsy-but-defined values (e.g. empty object)", () => {
		const bh = new BHAI()
		const emptyRetriever = {} // falsy but !== undefined

		bh.use({ retriever: emptyRetriever })

		const results = bh.getContributions("retriever")

		expect(results).toHaveLength(1)
		expect(results[0]).toBe(emptyRetriever)
		// Verify that if someone naively used truthiness check, this would break:
		// an empty object is falsy in some contexts, but !== undefined, so it
		// must be included to pass this test.
		expect(results[0]).not.toBe(undefined)
	})
})
