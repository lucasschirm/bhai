export function greet(name: string): string {
	return `Hello, ${name}!`
}

export { EventBus } from "./conversation/event-bus"
export type { EmitHandler, FoldHandler } from "./conversation/event-bus"
export { Conversation } from "./conversation/system-prompt"
export type {
	ResolvedSystemPrompt,
	StartEventPatch,
	StartHandler,
} from "./conversation/system-prompt"
