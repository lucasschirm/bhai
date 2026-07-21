/** @file Streaming text parser for reasoning model output with <think> tags. */

const OPEN_TAG = "<think>"
const CLOSE_TAG = "</think>"

/**
 * Length of the longest proper prefix of `tag` that is also a suffix of `buf`.
 *
 * Used to hold back the tail of the buffer that might be the beginning of a tag
 * split across chunk boundaries (e.g. a buffer ending in `"</thi"`). Only proper
 * prefixes are considered — a full occurrence is handled by `indexOf` before this
 * is ever called.
 *
 * @param {string} buf - The current buffer.
 * @param {string} tag - The tag to look for a partial trailing match of.
 * @returns {number} The number of trailing characters to hold back (0 if none).
 */
function partialTagSuffixLen(buf, tag) {
	const max = Math.min(tag.length - 1, buf.length)
	for (let i = max; i >= 1; i--) {
		if (buf.endsWith(tag.slice(0, i))) return i
	}
	return 0
}

/**
 * Creates a splitter that routes streaming text into thought and answer buckets.
 *
 * Consumes text chunks that may contain `<think>...</think>` tags (e.g., from a reasoning model),
 * routing text inside tags to a cumulative `thought` and text outside to a cumulative `answer`.
 * Handles tags split arbitrarily across chunk boundaries via internal buffering.
 *
 * @returns {{
 *   push: (chunk: string) => { thoughtDelta: string; answerDelta: string };
 *   thought: string;
 *   answer: string;
 * }}
 */
export function createThinkSplitter() {
	let cumulativeThought = ""
	let cumulativeAnswer = ""
	let buffer = ""
	let insideThink = false

	return {
		/**
		 * Pushes a text chunk into the splitter.
		 *
		 * Mutates cumulative thought/answer state and returns the incremental delta
		 * contributed by this chunk.
		 *
		 * @param {string} chunk - Text to process
		 * @returns {{ thoughtDelta: string; answerDelta: string }} Incremental deltas for this chunk
		 */
		push(chunk) {
			let thoughtDelta = ""
			let answerDelta = ""

			buffer += chunk

			// Consume from the FRONT of `buffer` each iteration so that all progress
			// is persisted across pushes — `buffer` is the single source of truth.
			// (A prior version tracked a local `pos` that reset every push, so a tag
			// landing exactly on a chunk boundary, e.g. a lone "<think>"/"</think>"
			// chunk, was re-scanned and leaked into the output.)
			while (buffer.length > 0) {
				if (insideThink) {
					const closeIndex = buffer.indexOf(CLOSE_TAG)
					if (closeIndex !== -1) {
						// Closing tag fully present: emit text before it, drop the tag.
						const text = buffer.slice(0, closeIndex)
						thoughtDelta += text
						cumulativeThought += text
						buffer = buffer.slice(closeIndex + CLOSE_TAG.length)
						insideThink = false
						continue
					}
					// No closing tag yet: emit everything except a possible partial tag
					// held back at the tail for the next chunk.
					const hold = partialTagSuffixLen(buffer, CLOSE_TAG)
					const safe = buffer.slice(0, buffer.length - hold)
					thoughtDelta += safe
					cumulativeThought += safe
					buffer = buffer.slice(buffer.length - hold)
					break
				}

				const openIndex = buffer.indexOf(OPEN_TAG)
				if (openIndex !== -1) {
					// Opening tag fully present: emit text before it, drop the tag.
					const text = buffer.slice(0, openIndex)
					answerDelta += text
					cumulativeAnswer += text
					buffer = buffer.slice(openIndex + OPEN_TAG.length)
					insideThink = true
					continue
				}
				// No opening tag yet: emit everything except a possible partial tag.
				const hold = partialTagSuffixLen(buffer, OPEN_TAG)
				const safe = buffer.slice(0, buffer.length - hold)
				answerDelta += safe
				cumulativeAnswer += safe
				buffer = buffer.slice(buffer.length - hold)
				break
			}

			return { thoughtDelta, answerDelta }
		},

		get thought() {
			return cumulativeThought
		},

		get answer() {
			return cumulativeAnswer
		},
	}
}
