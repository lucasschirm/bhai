// Public types barrel for BHAI's cross-cutting shared types (TASK_0002).
//
// Re-exports every type declared under src/types/. Downstream tasks
// (TASK_0003 kernel, TASK_0008 tool registry, TASK_0009 drivers, TASK_0023
// conversation) import from here or from the root package barrel
// (`@lucasschirm/bhai`), which re-exports this file.
//
// This barrel is types only — no runtime logic lives anywhere under src/types/.
export type { CallToolResult, ContentBlock, JSONSchema } from "./content.js"
export type {
	BHAIMessage,
	ConversationStatus,
} from "./message.js"
export type {
	DriverCapabilities,
	ModelInfo,
	Usage,
} from "./model.js"
export type { EmitResult, Unsubscribe } from "./events.js"
export type {
	BHAIDriver,
	ChatRequest,
	DriverEvent,
	GenerationParams,
	ToolWireDefinition,
} from "./driver.js"
// Tool types were not landed by TASK_0002 before TASK_0008 started; TASK_0008
// added them in `./tool.js` on TASK_0002's behalf (see the coordination note
// at the top of that file). Re-exported here so the barrel stays the single
// import point for downstream tasks.
export type {
	BHAIConversation,
	BHAIToolDefinition,
	Icon,
	ToolAnnotations,
	ToolExecute,
	ToolFilter,
	ToolInvocation,
} from "./tool.js"
