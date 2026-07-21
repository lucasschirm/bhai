/** @file Tests for display formatting utilities. */

import { describe, expect, it } from "vitest"
import { formatBytes, formatSeconds, formatTokens, formatTps } from "./format.js"

describe("formatTps", () => {
	it("formats one decimal place", () => {
		expect(formatTps(42.06)).toBe("42.1")
		expect(formatTps(128.4)).toBe("128.4")
		expect(formatTps(1.234)).toBe("1.2")
	})

	it("returns em dash for null", () => {
		expect(formatTps(null)).toBe("—")
	})

	it("returns em dash for undefined", () => {
		expect(formatTps(undefined)).toBe("—")
	})

	it("handles zero", () => {
		expect(formatTps(0)).toBe("0.0")
	})
})

describe("formatTokens", () => {
	it("formats with thousands separators", () => {
		expect(formatTokens(12345)).toBe("12,345")
		expect(formatTokens(1000000)).toBe("1,000,000")
	})

	it("handles zero", () => {
		expect(formatTokens(0)).toBe("0")
	})

	it("handles single digit", () => {
		expect(formatTokens(5)).toBe("5")
	})

	it("floors decimal values", () => {
		expect(formatTokens(1234.7)).toBe("1,234")
	})
})

describe("formatBytes", () => {
	it("formats bytes for values < 1024", () => {
		expect(formatBytes(0)).toBe("0 B")
		expect(formatBytes(512)).toBe("512 B")
		expect(formatBytes(1023)).toBe("1023 B")
	})

	it("formats kilobytes", () => {
		expect(formatBytes(1024)).toBe("1.0 KB")
		expect(formatBytes(1536)).toBe("1.5 KB")
		expect(formatBytes(1024 * 1024 - 1)).toMatch(/^[0-9.]+\s*KB$/)
	})

	it("formats megabytes", () => {
		const mb = 1024 * 1024
		expect(formatBytes(mb)).toBe("1.0 MB")
		expect(formatBytes(mb * 2.5)).toBe("2.5 MB")
	})

	it("formats gigabytes", () => {
		const gb = 1024 * 1024 * 1024
		expect(formatBytes(gb)).toBe("1.0 GB")
		expect(formatBytes(gb * 3.7)).toBe("3.7 GB")
	})
})

describe("formatSeconds", () => {
	it("formats with one decimal place", () => {
		expect(formatSeconds(0.4)).toBe("0.4s")
		expect(formatSeconds(12.3)).toBe("12.3s")
		expect(formatSeconds(0.123)).toBe("0.1s")
	})

	it("handles zero", () => {
		expect(formatSeconds(0)).toBe("0.0s")
	})

	it("handles large values", () => {
		expect(formatSeconds(60)).toBe("60.0s")
		expect(formatSeconds(120.456)).toBe("120.5s")
	})
})
