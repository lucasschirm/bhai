/** @file Streaming text parser for reasoning model output with <think> tags. */

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

			let pos = 0

			while (pos < buffer.length) {
				if (insideThink) {
					// Look for closing tag
					const closeIndex = buffer.indexOf("</think>", pos)

					if (closeIndex !== -1) {
						// Found closing tag
						const textBefore = buffer.substring(pos, closeIndex)
						thoughtDelta += textBefore
						cumulativeThought += textBefore
						pos = closeIndex + 8 // Skip past </think>
						insideThink = false
					} else {
						// No closing tag yet; check if tail might be start of closing tag
						const tail = buffer.substring(pos)
						const closePrefix = "</think>"

						// Check if tail ends with a prefix of the closing tag
						let isPotentialStart = false
						let potentialPrefixLen = 0
						for (let i = 1; i <= Math.min(closePrefix.length, tail.length); i++) {
							if (tail.endsWith(closePrefix.substring(0, i))) {
								isPotentialStart = true
								potentialPrefixLen = i
							}
						}

						if (isPotentialStart && potentialPrefixLen < closePrefix.length) {
							// Hold back the tail suffix that might be the start of the tag
							const safeLen = tail.length - potentialPrefixLen
							const safeText = tail.substring(0, safeLen)
							if (safeText.length > 0) {
								thoughtDelta += safeText
								cumulativeThought += safeText
							}
							buffer = tail.substring(safeLen)
							break
						}
						// Tail is definitely not a prefix; emit it
						thoughtDelta += tail
						cumulativeThought += tail
						buffer = ""
						pos = buffer.length
					}
				} else {
					// Look for opening tag
					const openIndex = buffer.indexOf("<think>", pos)

					if (openIndex !== -1) {
						// Found opening tag
						const textBefore = buffer.substring(pos, openIndex)
						answerDelta += textBefore
						cumulativeAnswer += textBefore
						pos = openIndex + 7 // Skip past <think>
						insideThink = true
					} else {
						// No opening tag; check if tail might be start of opening tag
						const tail = buffer.substring(pos)
						const openPrefix = "<think>"

						// Check if tail ends with a prefix of the opening tag
						let isPotentialStart = false
						let potentialPrefixLen = 0
						for (let i = 1; i <= Math.min(openPrefix.length, tail.length); i++) {
							if (tail.endsWith(openPrefix.substring(0, i))) {
								isPotentialStart = true
								potentialPrefixLen = i
							}
						}

						if (isPotentialStart && potentialPrefixLen < openPrefix.length) {
							// Hold back the tail suffix that might be the start of the tag
							const safeLen = tail.length - potentialPrefixLen
							const safeText = tail.substring(0, safeLen)
							if (safeText.length > 0) {
								answerDelta += safeText
								cumulativeAnswer += safeText
							}
							buffer = tail.substring(safeLen)
							break
						}
						// Tail is definitely not a prefix; emit it
						answerDelta += tail
						cumulativeAnswer += tail
						buffer = ""
						pos = buffer.length
					}
				}
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
