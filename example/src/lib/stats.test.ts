/** @file Tests for WebLLM statistics parsing. */

import { describe, expect, it } from "vitest"
import { parseRuntimeStats } from "./stats.js"

describe("parseRuntimeStats", () => {
	it("parses standard format with both prefill and decode", () => {
		const result = parseRuntimeStats("prefill: 128.4 tokens/sec, decode: 42.1 tokens/sec")
		expect(result).toEqual({ prefillTps: 128.4, decodeTps: 42.1 })
	})

	it("parses decode-only string", () => {
		const result = parseRuntimeStats("decode: 42.1 tokens/sec")
		expect(result).toEqual({ prefillTps: null, decodeTps: 42.1 })
	})

	it("parses prefill-only string", () => {
		const result = parseRuntimeStats("prefill: 128.4 tokens/sec")
		expect(result).toEqual({ prefillTps: 128.4, decodeTps: null })
	})

	it("returns nulls for empty input", () => {
		const result = parseRuntimeStats("")
		expect(result).toEqual({ prefillTps: null, decodeTps: null })
	})

	it("returns nulls for garbage input", () => {
		const result = parseRuntimeStats("no numbers here")
		expect(result).toEqual({ prefillTps: null, decodeTps: null })
	})

	it("handles prompt synonym and tok/s unit variant", () => {
		const result = parseRuntimeStats("prompt: 200.0 tok/s | decode: 55.5 tok/s")
		expect(result).toEqual({ prefillTps: 200.0, decodeTps: 55.5 })
	})

	it("handles case-insensitive matching", () => {
		const result = parseRuntimeStats("PREFILL: 100.0 tokens/sec, DECODE: 50.0 tokens/sec")
		expect(result).toEqual({ prefillTps: 100.0, decodeTps: 50.0 })
	})

	it("returns nulls for non-string input", () => {
		// biome-ignore lint/suspicious/noExplicitAny: testing runtime behavior with non-string types
		expect(parseRuntimeStats(null as any)).toEqual({ prefillTps: null, decodeTps: null })
		// biome-ignore lint/suspicious/noExplicitAny: testing runtime behavior with non-string types
		expect(parseRuntimeStats(undefined as any)).toEqual({ prefillTps: null, decodeTps: null })
	})

	it("handles numbers with varying decimal places", () => {
		const result = parseRuntimeStats("prefill: 123 tokens/sec, decode: 45.67 tokens/sec")
		expect(result).toEqual({ prefillTps: 123, decodeTps: 45.67 })
	})
})
