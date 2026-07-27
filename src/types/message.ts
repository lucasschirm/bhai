// Conversation-message type declarations (§ 11.1).
// Types only — no runtime logic. See TASK_0002 for the scope contract.

import type { ContentBlock } from "./content.js"

/**
 * The normalized internal message shape drivers and the conversation manager
 * operate on (§ 11.1). `content` is a convenience view of the text blocks;
 * `blocks` is the structured payload.
 *
 * `append`/`setContent` are method signatures on the interface — this is a
 * type declaration (an interface describing an object's shape), not runtime
 * logic. The implementing class is TASK_0023's responsibility. Per § 11.1
 * prose, `append`/`setContent` are legal only while the message's lifecycle
 * state is `'before'`; the mutation-legality rule itself is enforced by
 * TASK_0023's implementation, not by this type.
 */
export interface BHAIMessage {
	id: string
	role: "user" | "assistant" | "system" | "tool"
	content: string
	blocks: ContentBlock[]
	time: number
	meta: Record<string, unknown>
	append(text: string): void
	setContent(content: string | ContentBlock[]): void
}

/**
 * Conversation lifecycle status (§ 11.1). Extracted as its own named export
 * because multiple downstream tasks (TASK_0023, TASK_0031 compaction, event-bus
 * consumers) reference it without importing the full `BHAIConversation`
 * interface (which TASK_0023 owns).
 */
export type ConversationStatus =
	| "idle"
	| "streaming"
	| "waiting-tool"
	| "compacting"
	| "aborted"
	| "error"
