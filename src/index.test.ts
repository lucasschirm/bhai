import { describe, expect, it } from "vitest"
import * as root from "./index.js"

import { EventBus as ConvEventBus } from "./conversation/event-bus.js"
import { EventBus as CoreEventBus } from "./core/event-bus.js"

// Guards the root barrel's handling of the two same-named `EventBus` classes:
// the kernel bus (`core/event-bus.ts`, ARCHITECTURE.md § 8) keeps the
// unqualified name, and the narrower conversation bus is aliased. An
// `export *` from `./core` alongside an unaliased explicit re-export of the
// conversation class would silently shadow the kernel bus instead of erroring.
describe("root barrel", () => {
	it("exports the kernel event bus as EventBus", () => {
		expect(root.EventBus).toBe(CoreEventBus)
	})

	it("exports the conversation event bus under an alias", () => {
		expect(root.ConversationEventBus).toBe(ConvEventBus)
		expect(root.ConversationEventBus).not.toBe(root.EventBus)
	})

	it("exports the conversation system-prompt resolver", () => {
		expect(typeof root.Conversation).toBe("function")
	})
})
