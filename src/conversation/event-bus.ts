/**
 * A minimal, strongly-typed event bus.
 *
 * `Events` maps each event name to the payload type carried by that event.
 *
 * The bus exposes two dispatch styles:
 *
 * - {@link EventBus.emit} — plain fan-out. Every handler observes the same
 *   payload; return values are ignored. Use for pure side-effects.
 *
 * - {@link EventBus.fold} — an *ordered fold*. Each handler receives the value
 *   left behind by the previous handler and returns the next value. Because the
 *   running value threads through every handler in registration order, no order
 *   information is lost — unlike collapsing each handler's contribution into a
 *   single shallow-merged patch object, which cannot distinguish
 *   "replace then append" from "append then replace" once both keys are present.
 *
 * See `system-prompt.ts` for how the fold primitive is used to resolve the
 * `start` event's system-prompt layers.
 */

/** Handler for {@link EventBus.emit}: observes a payload, returns nothing. */
export type EmitHandler<T> = (payload: T) => void

/**
 * Handler for {@link EventBus.fold}: receives the running value and returns the
 * next value. Returning `undefined` (e.g. a handler with no `return`) leaves the
 * running value unchanged, so handlers that only care about certain dispatches
 * can opt out without having to echo the value back.
 */
// biome-ignore lint/suspicious/noConfusingVoidType: a handler may return the next value or nothing (leaving the running value unchanged)
export type FoldHandler<T> = (current: T) => T | undefined | void

type Registry<Events> = {
	[K in keyof Events]?: Array<FoldHandler<Events[K]>>
}

export class EventBus<Events extends Record<string, unknown>> {
	private readonly handlers: Registry<Events> = {}

	/**
	 * Register `handler` for `event`. Handlers fire in registration order.
	 * Returns a disposer that removes this handler.
	 */
	on<K extends keyof Events>(event: K, handler: FoldHandler<Events[K]>): () => void {
		const list: Array<FoldHandler<Events[K]>> = this.handlers[event] ?? []
		this.handlers[event] = list
		list.push(handler)
		return () => {
			const index = list.indexOf(handler)
			if (index >= 0) {
				list.splice(index, 1)
			}
		}
	}

	/**
	 * Fan out `payload` to every handler for side-effects. Handler return values
	 * are ignored; the payload is never mutated by the bus.
	 */
	emit<K extends keyof Events>(event: K, payload: Events[K]): void {
		for (const handler of this.handlers[event] ?? []) {
			;(handler as EmitHandler<Events[K]>)(payload)
		}
	}

	/**
	 * Fold `seed` through every handler for `event` in registration order.
	 *
	 * Handler _n_ receives the value returned by handler _n-1_ (or `seed` for the
	 * first handler) and returns the value passed to handler _n+1_. A handler that
	 * returns `undefined`/`void` leaves the running value untouched.
	 *
	 * The final running value is returned.
	 */
	fold<K extends keyof Events>(event: K, seed: Events[K]): Events[K] {
		let current = seed
		for (const handler of this.handlers[event] ?? []) {
			const next = handler(current)
			if (next !== undefined) {
				current = next
			}
		}
		return current
	}
}
