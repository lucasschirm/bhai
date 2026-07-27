/** @file Type-level proof that BHAIMessageExtensions merges via module augmentation. */

import { describe, expect, it } from "vitest"
import { createMessage } from "../conversation/message.js"
import { BHAI } from "../core/bhai.js"
import type { BHAIMessage } from "./message.js"

// This is exactly what a third-party plugin writes, except for the specifier.
// A plugin augments the package itself (`declare module "@lucasschirm/bhai"`),
// which merges even though `dist/index.d.ts` re-exports the interface from a
// bundled chunk — TypeScript follows the re-export alias to the original
// declaration. That specifier is unusable here because it only resolves once
// `dist/` exists, so this test augments the declaring module directly.
declare module "./message.js" {
	interface BHAIMessageExtensions {
		/** Contrived plugin field, used only by this test. */
		sentiment?: "positive" | "negative"
	}
}

describe("BHAIMessageExtensions module augmentation", () => {
	it("adds the augmented field to BHAIMessage's static type", () => {
		const bh = new BHAI()
		bh.defineMessageField("sentiment")

		const message = createMessage({ role: "assistant", content: "hi" }, bh._getMessageFields())

		// The assignment and the read below are the actual assertion: neither
		// compiles unless the augmentation merged into BHAIMessage.
		message.sentiment = "positive"
		const read: "positive" | "negative" | undefined = message.sentiment

		expect(read).toBe("positive")
		expect(message.meta.sentiment).toBe("positive")
	})

	it("keeps augmented members optional so pre-existing messages stay assignable", () => {
		// A message literal that predates the plugin must still satisfy BHAIMessage.
		const legacy: BHAIMessage = {
			id: "m1",
			role: "user",
			content: "x",
			blocks: [{ type: "text", text: "x" }],
			time: 0,
			meta: {},
			append() {},
			setContent() {},
		}

		expect(legacy.sentiment).toBeUndefined()
	})
})
