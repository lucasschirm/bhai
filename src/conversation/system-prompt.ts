/** @file System-prompt layering and start-event firing (TASK_0024) */

import type { BHAI } from "../core/bhai.js"
import type { ContentBlock } from "../types/content.js"
import type { EmitResult } from "../types/events.js"
import type { BHAIMessage } from "../types/message.js"
import type { CreateConversationOptions } from "./conversation.js"
import type { BHAIConversationImpl } from "./conversation.js"

/**
 * Message initialization shape — input to `prepend` arrays in start-event patches.
 *
 * Each `MessageInit` is converted to a full `BHAIMessage` (with fresh UUID, timestamp,
 * derived blocks/content fields) and inserted into the conversation history via `prepend`.
 *
 * The `contextIncluded` field (default `true`) is stored as `meta.contextIncluded` to signal
 * downstream whether this message should be included in the `context` event's filtered
 * message list. This is a documented convention: TASK_0025+ must honor it when computing
 * the effective message set for `context` events and later compaction (TASK_0031).
 */
export interface MessageInit {
	/** Role: user, assistant, or system. */
	role: "user" | "assistant" | "system"

	/** Message content — plain string or structured blocks. */
	content: string | ContentBlock[]

	/** Optional metadata record. Merged with `{ contextIncluded }` on the final message. */
	meta?: Record<string, unknown>

	/**
	 * Whether this message is included in context-event filtering (default `true`).
	 * Stored as `message.meta.contextIncluded` for downstream tasks to key off.
	 * Display-only messages (e.g., explanatory preamble) use `false` to stay out
	 * of the effective message list passed to the LLM in `context` events.
	 */
	contextIncluded?: boolean
}

/**
 * Start-event patch shape — returned by handlers listening for `conversation.start`.
 *
 * Handlers may return any combination of:
 * - `{ systemPrompt: string }` — REPLACES the current prompt outright (layer 3)
 * - `{ appendSystemPrompt: string }` — APPENDS to the current prompt (layer 3)
 * - `{ prepend: MessageInit[] }` — inserts messages at the top of history (§ 11.6)
 */
export interface StartEventPatch {
	/** Replaces the system prompt outright. */
	systemPrompt?: string

	/** Appends to the system prompt with a blank-line separator. */
	appendSystemPrompt?: string

	/**
	 * Messages to prepend to the conversation history.
	 *
	 * CONVENTION FOR ACCUMULATING ARRAYS ACROSS HANDLERS:
	 * Multiple handlers may each contribute a `prepend` array. The EventBus patch-chain
	 * mechanism passes the incoming payload (containing patches from previous handlers)
	 * to each handler in registration order. A handler that wants to append to a
	 * prepend array must READ the incoming `payload.prepend` (if any) and concatenate
	 * its own array onto it before returning, e.g.:
	 *
	 * ```typescript
	 * conversation.on('start', async (payload) => {
	 *   const existingPrepend = payload.prepend ?? []
	 *   return { prepend: [...existingPrepend, myMessage] }
	 * })
	 * ```
	 *
	 * This idiom (read-then-append rather than blindly returning a fresh array)
	 * is the general BHAI solution for accumulating array-typed patch fields when
	 * multiple handlers each want to contribute. The same pattern applies to any
	 * future accumulating array field in any event patch.
	 */
	prepend?: MessageInit[]
}

/**
 * Compute the fully-resolved system prompt (layers 1-3).
 *
 * Returns the system prompt with host default (layer 1) and per-conversation override
 * (layer 2) already applied, plus any `start`-event patches (layer 3) that handlers
 * have registered. Layer 4 (`context`-event patches) is explicitly deferred — TASK_0025
 * owns computing and applying those.
 *
 * This function is the handoff point for TASK_0025: call this at the top of `sendMessage`
 * to get the base prompt before firing the `context` event, then feed its result into
 * the `context` payload's `systemPrompt` field as the starting value before `context`
 * handlers run.
 *
 * @param conversation The conversation to read the prompt from.
 * @returns The fully-resolved pre-context system prompt.
 */
export function computePreContextSystemPrompt(conversation: BHAIConversationImpl): string {
	return conversation._getSystemPrompt()
}

/**
 * Idempotent `start`-event firing and preamble injection.
 *
 * Fires the `start` event exactly once per conversation (on first call; subsequent calls
 * return immediately). Collects patches from registered handlers and applies them:
 * - `systemPrompt` patches REPLACE the prompt outright
 * - `appendSystemPrompt` patches APPEND with a blank-line separator
 * - `prepend` arrays are concatenated (via the read-then-append handler idiom) and
 *   inserted at the top of the message history
 *
 * The `_started` flag is set BEFORE dispatch (not after) to prevent re-entrant double-fire
 * in case of concurrent `sendMessage` calls racing on the same conversation.
 *
 * For conversations loaded via `loadConversation()`, the `_started` flag is already `true`,
 * so this function returns immediately without firing anything.
 *
 * @param conversation The conversation to start.
 * @param bh The BHAI instance (passed for potential future use; currently unused).
 * @param options The conversation's creation options, passed to start-event handlers.
 * @param firstMessage The triggering user message (if any), passed to start-event handlers.
 *                     Prepended messages are inserted BEFORE this message in history.
 */
export async function ensureStarted(
	conversation: BHAIConversationImpl,
	bh: BHAI,
	options: CreateConversationOptions,
	firstMessage: BHAIMessage | undefined,
): Promise<void> {
	// Idempotency check: if already started, return immediately.
	if (conversation._isStarted()) {
		return
	}

	// Set the flag BEFORE awaiting dispatch to prevent re-entrant double-fire.
	// The flag itself is the single source of truth for "has start begun," not
	// "has start finished" — this ensures that a concurrent call to ensureStarted()
	// sees the flag as true and skips dispatch, even if the first call hasn't
	// awaited past the dispatch yet.
	conversation._markStarted()

	// Dispatch the start event via the shared mirroring mechanism.
	const result = await conversation._dispatchConversationEvent<{
		conversation: BHAIConversationImpl
		options: CreateConversationOptions
		firstMessage: BHAIMessage | undefined
	}>("start", {
		conversation,
		options,
		firstMessage,
	})

	// Apply patches from handlers.
	const patch = result.patch as Partial<StartEventPatch>

	// Layer 3: apply system-prompt patches.
	if ("systemPrompt" in patch && patch.systemPrompt !== undefined) {
		// REPLACE: systemPrompt completely overwrites the current prompt.
		conversation._setSystemPrompt(patch.systemPrompt)
	} else if ("appendSystemPrompt" in patch && patch.appendSystemPrompt !== undefined) {
		// APPEND: concatenate with exactly one blank line separator if current is non-empty.
		const current = conversation._getSystemPrompt()
		const appended = current
			? `${current}\n\n${patch.appendSystemPrompt}`
			: patch.appendSystemPrompt
		conversation._setSystemPrompt(appended)
	}

	// Layer 3: inject prepended messages at the top of history.
	if ("prepend" in patch && patch.prepend && patch.prepend.length > 0) {
		const messages = patch.prepend.map((init) => initToMessage(init))
		conversation._prependMessages(messages)
	}
}

/**
 * Convert a `MessageInit` to a full `BHAIMessage`.
 *
 * Assigns a fresh UUID, timestamp, and derives the `blocks` array from `content`
 * if it is a plain string. Merges `meta` with the `contextIncluded` convention.
 *
 * @internal
 */
function initToMessage(init: MessageInit): BHAIMessage {
	const id = crypto.randomUUID()
	const time = Date.now()

	// Derive blocks and content string from the content field.
	let blocks: ContentBlock[]
	let content: string

	if (typeof init.content === "string") {
		content = init.content
		blocks = [{ type: "text", text: init.content }]
	} else {
		blocks = init.content
		// Concatenate all text blocks to form the string content.
		content = blocks
			.filter((b) => b.type === "text")
			.map((b) => (b as ContentBlock & { type: "text" }).text)
			.join("")
	}

	// Merge metadata with the contextIncluded convention.
	const meta = {
		...init.meta,
		contextIncluded: init.contextIncluded ?? true,
	}

	// Synthetic messages inserted here have simple content mutation (append/setContent).
	// This is safe for prepended preamble messages since they are not actively streaming.
	// TASK_0025+ will own the real state-based mutation-legality enforcement.
	const message: BHAIMessage = {
		id,
		role: init.role,
		time,
		content,
		blocks,
		meta,
		append(text: string) {
			this.content += text
			const lastBlock = this.blocks[this.blocks.length - 1]
			if (lastBlock && lastBlock.type === "text") {
				;(lastBlock as ContentBlock & { type: "text" }).text += text
			} else {
				this.blocks.push({ type: "text", text })
			}
		},
		setContent(text: string) {
			this.content = text
			this.blocks = [{ type: "text", text }]
		},
	}

	return message
}
