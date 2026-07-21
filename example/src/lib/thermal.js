/** @file Thermal color mapping utilities for numeric values. */

/**
 * Calculates a thermal ratio for a numeric value within a range.
 *
 * Maps a value to a ratio in [0, 1] using linear scaling, clamped to the bounds.
 *
 * @param {number} value - The value to convert
 * @param {number} [min=0] - Lower bound of the range
 * @param {number} [max=60] - Upper bound of the range
 * @returns {number} A ratio in [0, 1]
 */
export function thermalRatio(value, min = 0, max = 60) {
	const ratio = (value - min) / (max - min)
	return Math.max(0, Math.min(1, ratio))
}

/**
 * Converts a thermal ratio to an RGB color string.
 *
 * Linearly interpolates in RGB space across three stops:
 * - Cold (#38BDF8 / rgb(56, 189, 248)) at ratio 0.0
 * - Mid (#A78BFA / rgb(167, 139, 250)) at ratio 0.5
 * - Hot (#FB7185 / rgb(251, 113, 133)) at ratio 1.0
 *
 * @param {number} ratio - A ratio in [0, 1] (clamped if outside bounds)
 * @returns {string} RGB color string, e.g. "rgb(56, 189, 248)"
 */
export function thermalColor(ratio) {
	// Clamp ratio to [0, 1]
	const clamped = Math.max(0, Math.min(1, ratio))

	// Cold -> Mid for [0, 0.5], Mid -> Hot for [0.5, 1]
	if (clamped <= 0.5) {
		// Interpolate from cold to mid
		const scaledRatio = clamped / 0.5 //  [0, 1]
		const r = Math.round(56 + (167 - 56) * scaledRatio)
		const g = Math.round(189 + (139 - 189) * scaledRatio)
		const b = Math.round(248 + (250 - 248) * scaledRatio)
		return `rgb(${r}, ${g}, ${b})`
	}

	// Interpolate from mid to hot
	const scaledRatio = (clamped - 0.5) / 0.5 //  [0, 1]
	const r = Math.round(167 + (251 - 167) * scaledRatio)
	const g = Math.round(139 + (113 - 139) * scaledRatio)
	const b = Math.round(250 + (133 - 250) * scaledRatio)
	return `rgb(${r}, ${g}, ${b})`
}
