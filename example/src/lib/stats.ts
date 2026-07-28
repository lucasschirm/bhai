/** @file Extract performance stats from WebLLM runtime statistics text. */

/** Tokens-per-second rates extracted from a runtime-stats string. */
export interface RuntimeStats {
	/** Prompt-processing throughput, or null when the text did not report it. */
	prefillTps: number | null
	/** Generation throughput, or null when the text did not report it. */
	decodeTps: number | null
}

/**
 * Parses WebLLM runtime statistics text to extract tokens-per-second rates.
 *
 * Robustly extracts prefill/prompt and decode throughput from `engine.runtimeStatsText()` output,
 * handling variations in format and terminology across WebLLM versions.
 *
 * Case-insensitive keyword matching for "prefill"/"prompt" and "decode", extracting the
 * associated floating-point number. Returns null for any unmatched keyword.
 *
 * @param text - WebLLM runtime statistics text
 * @returns Tokens-per-second rates or null
 */
export function parseRuntimeStats(text: string): RuntimeStats {
	if (!text || typeof text !== "string") {
		return { prefillTps: null, decodeTps: null }
	}

	const lowerText = text.toLowerCase()
	const result: RuntimeStats = { prefillTps: null, decodeTps: null }

	// Match "prefill" or "prompt" followed by a colon, whitespace, and a number
	// Allow for variations like "tokens/sec", "tok/s", etc.
	const prefillMatch = lowerText.match(/(prefill|prompt)[:\s]+([0-9.]+)/i)
	if (prefillMatch?.[2]) {
		const num = Number.parseFloat(prefillMatch[2])
		if (!Number.isNaN(num)) {
			result.prefillTps = num
		}
	}

	// Match "decode" followed by a colon, whitespace, and a number
	const decodeMatch = lowerText.match(/decode[:\s]+([0-9.]+)/i)
	if (decodeMatch?.[1]) {
		const num = Number.parseFloat(decodeMatch[1])
		if (!Number.isNaN(num)) {
			result.decodeTps = num
		}
	}

	return result
}
