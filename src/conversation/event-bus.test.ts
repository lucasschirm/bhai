import { describe, expect, it } from "vitest"
import { EventBus } from "./event-bus.js"

type Events = {
	count: number
	log: string
}

describe("EventBus", () => {
	it("fold threads the running value through handlers in registration order", () => {
		const bus = new EventBus<Events>()
		bus.on("count", (n) => n + 1)
		bus.on("count", (n) => n * 10)
		expect(bus.fold("count", 0)).toBe(10)
	})

	it("fold leaves the value untouched when a handler returns undefined", () => {
		const bus = new EventBus<Events>()
		bus.on("count", (n) => n + 5)
		bus.on("count", () => undefined)
		expect(bus.fold("count", 0)).toBe(5)
	})

	it("fold returns the seed when no handlers are registered", () => {
		const bus = new EventBus<Events>()
		expect(bus.fold("count", 42)).toBe(42)
	})

	it("emit fans out to every handler for side-effects", () => {
		const bus = new EventBus<Events>()
		const seen: string[] = []
		bus.on("log", (msg) => {
			seen.push(`a:${msg}`)
		})
		bus.on("log", (msg) => {
			seen.push(`b:${msg}`)
		})
		bus.emit("log", "hi")
		expect(seen).toEqual(["a:hi", "b:hi"])
	})

	it("the disposer removes a handler", () => {
		const bus = new EventBus<Events>()
		const dispose = bus.on("count", (n) => n + 1)
		bus.on("count", (n) => n + 100)
		dispose()
		expect(bus.fold("count", 0)).toBe(100)
	})
})
