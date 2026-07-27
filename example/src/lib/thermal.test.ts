/** @file Tests for thermal color mapping. */

import { describe, expect, it } from "vitest"
import { thermalColor, thermalRatio } from "./thermal.js"

describe("thermalRatio", () => {
	it("calculates ratio for midpoint", () => {
		expect(thermalRatio(30, 0, 60)).toBe(0.5)
	})

	it("clamps below minimum", () => {
		expect(thermalRatio(-10, 0, 60)).toBe(0)
	})

	it("clamps above maximum", () => {
		expect(thermalRatio(1000, 0, 60)).toBe(1)
	})

	it("handles ratio at bounds", () => {
		expect(thermalRatio(0, 0, 60)).toBe(0)
		expect(thermalRatio(60, 0, 60)).toBe(1)
	})

	it("uses default min and max", () => {
		expect(thermalRatio(30)).toBe(0.5)
		expect(thermalRatio(0)).toBe(0)
		expect(thermalRatio(60)).toBe(1)
	})
})

describe("thermalColor", () => {
	it("returns cold color at ratio 0", () => {
		expect(thermalColor(0)).toBe("rgb(56, 189, 248)")
	})

	it("returns mid color at ratio 0.5", () => {
		expect(thermalColor(0.5)).toBe("rgb(167, 139, 250)")
	})

	it("returns hot color at ratio 1", () => {
		expect(thermalColor(1)).toBe("rgb(251, 113, 133)")
	})

	it("clamps below 0 to cold color", () => {
		expect(thermalColor(-1)).toBe("rgb(56, 189, 248)")
	})

	it("clamps above 1 to hot color", () => {
		expect(thermalColor(2)).toBe("rgb(251, 113, 133)")
	})

	it("interpolates between cold and mid", () => {
		const color = thermalColor(0.25)
		expect(color).toMatch(/^rgb\(\d+, \d+, \d+\)$/)
		// At 0.25, we're halfway between cold (0) and mid (0.5)
		// Scaled ratio = 0.25 / 0.5 = 0.5
		// r = 56 + 111 * 0.5 = 111.5 → 112
		// g = 189 - 50 * 0.5 = 164 → 164
		// b = 248 + 2 * 0.5 = 249 → 249
		expect(color).toBe("rgb(112, 164, 249)")
	})

	it("interpolates between mid and hot", () => {
		const color = thermalColor(0.75)
		expect(color).toMatch(/^rgb\(\d+, \d+, \d+\)$/)
		// At 0.75, we're halfway between mid (0.5) and hot (1.0)
		// Scaled ratio = (0.75 - 0.5) / 0.5 = 0.5
		// r = 167 + 84 * 0.5 = 209 → 209
		// g = 139 - 26 * 0.5 = 126 → 126
		// b = 250 - 117 * 0.5 = 191.5 → 192
		expect(color).toBe("rgb(209, 126, 192)")
	})
})
