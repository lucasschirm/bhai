// Driver-interface type declarations (§ 10.1).
// Types only — no runtime logic. See TASK_0002 for the scope contract.
//
// NOTE: the full `BHAIDriver` interface (with `listModels`, `capabilities`,
// `chat`, optional `embed`) is TASK_0009's responsibility — this file supplies
// only the shapes that cross the kernel/driver boundary and that other layers
// (kernel, conversation) need to reference by name.

import type { JSONSchema } from "./content.js"
import type { BHAIMessage } from "./message.js"

/**
 * Generation overrides passed through `ChatRequest.params` (§ 10.1).
 *
 * Explicit assumption: the spec does not state which of
 * `temperature`/`maxTokens`/`stop` are optional vs required. All are marked
 * optional because generation params are typically overrides on top of
 * driver/model defaults — a caller that wants the driver default for any of
 * them simply omits the field. `reasoning` standardizes thinking effort across
 * drivers (pi's `thinkingLevel` scale); drivers whose `capabilities()` report
 * `reasoning: false` ignore it.
 */
export interface GenerationParams {
	temperature?: number
	maxTokens?: number
	stop?: string[]
	reasoning?: "off" | "minimal" | "low" | "medium" | "high" | "max"
}

/**
 * The unified streaming event shape emitted by `BHAIDriver.chat()` (§ 10.1).
 * A discriminated union on `type` with the exact string-literal discriminants
 * and field names per the spec.
 *
 * `unknown` (never `any`) is used for `tool-call`'s `input` and `done`'s
 * `error` fields, since their concrete shape is driver/tool-specific and not
 * knowable at this layer.
 */
export type DriverEvent =
	| { type: "delta"; text: string }
	| { type: "reasoning-delta"; text: string }
	| { type: "tool-call-delta"; toolCallId: string; argsDelta: string }
	| { type: "tool-call"; toolCallId: string; name: string; input: unknown }
	| { type: "usage"; inputTokens: number; outputTokens: number }
	| {
			type: "done"
			stopReason: "stop" | "tool-calls" | "length" | "abort" | "error"
			error?: unknown
	  }

/**
 * Minimal wire-projection of a tool definition onto what's sent to a
 * driver/model (§ 10.1's `tools?: ToolWireDefinition[]`).
 *
 * Explicit assumption: this is the minimal wire-projection implied by § 10.1's
 * parenthetical ("name/description/inputSchema, projected from the MCP Tool
 * records (§ 9.1)"). The full `BHAIToolDefinition` (with `execute`, `tags`,
 * `serial`, `outputSchema`, `annotations`, etc. per § 9.1) is TASK_0008's
 * responsibility. `ToolWireDefinition` intentionally strips the BHAI-local,
 * non-serializable fields since it represents what's sent to a driver/model,
 * not the internal registry record.
 */
export interface ToolWireDefinition {
	name: string
	description: string
	inputSchema: JSONSchema
}

/**
 * The request handed to `BHAIDriver.chat()` (§ 10.1). `messages` use the
 * normalized internal `BHAIMessage` shape; drivers map to their wire format.
 */
export interface ChatRequest {
	model: string
	messages: BHAIMessage[]
	systemPrompt?: string
	tools?: ToolWireDefinition[]
	params?: GenerationParams
	signal: AbortSignal
}
