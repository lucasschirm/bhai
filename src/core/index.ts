// Core kernel barrel — populated by later tasks (kernel types, BHAI class,
// Conversation, event bus, decorators; see ARCHITECTURE.md §§ 6-11).
//
// ENVIRONMENT BOUNDARY (§ 5): files under src/core/** depend only on web-standard
// APIs (fetch, AbortController, ReadableStream/async iterables, crypto.randomUUID,
// structuredClone). No Node built-ins, no DOM, no imports from src/plugins/**.
export {
	BHAI,
	type BHAIHostOptions,
	type BHAIPlugin,
	type BHAIPluginCapabilities,
	type BHAIPluginFactory,
	type BHAIPluginLike,
	type ConfigChangedPayload,
} from "./bhai.js"
export { CommandRegistry } from "./commands.js"
export {
	EventBus,
	type BlockSignal,
	type DispatchOptions,
	type Handler,
} from "./event-bus.js"
export {
	BHAI_PLUGIN_META,
	Plugin,
	On,
	Tool,
	type BHPlugin,
	type PluginMetadata,
	type ToolRegistrar,
} from "./decorators.js"
// TASK_0015: MCP integration — `bh.addMcp()` + getMcps/modelSource hooks.
export {
	McpRegistry,
	type McpAttachedPayload,
	type McpClientFactory,
	type McpClientLike,
	type McpHandle,
	type ResolvedGetMcpsHook,
	type ResolvedModelSourceHook,
	resolveGetMcpsHooks,
	resolveModelSourceHooks,
} from "./mcp-integration.js"
