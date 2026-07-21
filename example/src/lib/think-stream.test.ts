/** @file Tests for streaming text parser with <think> tags. */

import { describe, expect, it } from "vitest"
import { createThinkSplitter } from "./think-stream.js"

describe("createThinkSplitter", () => {
	it("handles text with no think block", () => {
		const s = createThinkSplitter()
		const d = s.push("Hello world")

		expect(d).toEqual({ thoughtDelta: "", answerDelta: "Hello world" })
		expect(s.thought).toBe("")
		expect(s.answer).toBe("Hello world")
	})

	it("handles single-chunk block", () => {
		const s = createThinkSplitter()
		const d = s.push("<think>reasoning</think>final")

		expect(s.thought).toBe("reasoning")
		expect(s.answer).toBe("final")
		expect(d).toEqual({ thoughtDelta: "reasoning", answerDelta: "final" })
	})

	it("handles split across chunks", () => {
		const s = createThinkSplitter()
		const d1 = s.push("<thi")
		const d2 = s.push("nk>abc</thi")
		const d3 = s.push("nk>def")

		expect(s.thought).toBe("abc")
		expect(s.answer).toBe("def")
		// Verify that deltas accumulate correctly
		expect(
			d1.thoughtDelta +
				d1.answerDelta +
				d2.thoughtDelta +
				d2.answerDelta +
				d3.thoughtDelta +
				d3.answerDelta,
		).toBe("abcdef")
	})

	it("handles unterminated think block", () => {
		const s = createThinkSplitter()
		s.push("<think>still thinking")

		expect(s.thought).toBe("still thinking")
		expect(s.answer).toBe("")
	})

	it("handles leading text before think then after", () => {
		const s = createThinkSplitter()
		s.push("pre <think>mid</think> post")

		expect(s.answer).toBe("pre  post")
		expect(s.thought).toBe("mid")
	})

	it("handles multiple think blocks", () => {
		const s = createThinkSplitter()
		s.push("<think>first</think> text <think>second</think> more")

		expect(s.thought).toBe("firstsecond")
		expect(s.answer).toBe(" text  more")
	})

	it("handles adjacent opening and closing tags", () => {
		const s = createThinkSplitter()
		s.push("start<think></think>end")

		expect(s.thought).toBe("")
		expect(s.answer).toBe("startend")
	})

	it("does not leak tags when each tag lands on its own chunk boundary", () => {
		const s = createThinkSplitter()
		for (const c of ["<think>", "reason", "</think>", "answer"]) s.push(c)

		expect(s.thought).toBe("reason")
		expect(s.answer).toBe("answer")
	})

	it("does not leak tags when streamed token-by-token", () => {
		const s = createThinkSplitter()
		for (const c of [
			"<",
			"think",
			">",
			"reasoning",
			" here",
			"</",
			"think",
			">",
			"the ",
			"answer",
		]) {
			s.push(c)
		}

		expect(s.thought).toBe("reasoning here")
		expect(s.answer).toBe("the answer")
	})

	it("does not hang when a chunk ends on a genuine partial tag prefix (infinite loop regression guard)", () => {
		const s = createThinkSplitter()
		// This must return synchronously without hanging
		const result = s.push("<thi")
		expect(result).toEqual({ thoughtDelta: "", answerDelta: "" })
		expect(s.thought).toBe("")
		expect(s.answer).toBe("")
	})

	it("does not hang when closing tag ends on partial prefix", () => {
		const s = createThinkSplitter()
		const d1 = s.push("<think>text</thi")
		expect(d1).toEqual({ thoughtDelta: "text", answerDelta: "" })
		const d2 = s.push("nk>after")
		expect(d2).toEqual({ thoughtDelta: "", answerDelta: "after" })
		expect(s.thought).toBe("text")
		expect(s.answer).toBe("after")
	})
})
