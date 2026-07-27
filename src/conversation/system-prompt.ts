import { EventBus } from "./event-bus.js"

/**
 * Sugar patch a `start` handler may return to influence the resolved system
 * prompt. All fields are optional; a handler that returns `undefined` (or has no
 * `return`) leaves the running value untouched.
 *
 * - `systemPrompt` — **replace** the running system prompt outright.
 * - `appendSystemPrompt` — **append** a section after the running system prompt
 *   (separated by a blank line).
 * - `prepend` — accumulate lines onto the front of the running `prepend` list.
 *
 * When a single patch carries both `systemPrompt` and `appendSystemPrompt`, the
 * replace applies first and the append second, so `{ systemPrompt: "X",
 * appendSystemPrompt: "Y" }` resolves to `"X\n\nY"`.
 */
export interface StartEventPatch {
	systemPrompt?: string
	appendSystemPrompt?: string
	prepend?: string[]
}

/** The fully resolved system-prompt state after all `start` handlers have run. */
export interface ResolvedSystemPrompt {
	systemPrompt: string
	prepend: readonly string[]
}

/**
 * A `start` handler. Receives the value left behind by the previous handler and
 * returns a {@link StartEventPatch} describing how to combine against it.
 *
 * Because each handler reads the *running* resolved value rather than emitting an
 * isolated patch that is later shallow-merged, the ordering between replace-style
 * and append-style handlers is preserved: handler A returning
 * `{ systemPrompt: "X" }` followed by handler B returning
 * `{ appendSystemPrompt: "Y" }` resolves to `"X\n\nY"`, while the reverse order
 * resolves to `"X"`.
 */
// biome-ignore lint/suspicious/noConfusingVoidType: a handler may return a patch or nothing (leaving the running value unchanged)
export type StartHandler = (current: ResolvedSystemPrompt) => StartEventPatch | undefined | void

type ConversationEvents = {
	start: ResolvedSystemPrompt
}

function appendSection(base: string, addition: string): string {
	return base.length > 0 ? `${base}\n\n${addition}` : addition
}

/**
 * Combine `patch` against the running resolved value.
 *
 * `systemPrompt` (replace) is applied before `appendSystemPrompt` (append) so a
 * single patch carrying both keys yields `"<replace>\n\n<append>"`. `prepend`
 * lines from this patch are placed ahead of whatever the running value already
 * accumulated.
 */
function applyStartPatch(
	current: ResolvedSystemPrompt,
	patch: StartEventPatch,
): ResolvedSystemPrompt {
	let systemPrompt = current.systemPrompt
	if (patch.systemPrompt !== undefined) {
		systemPrompt = patch.systemPrompt
	}
	if (patch.appendSystemPrompt !== undefined) {
		systemPrompt = appendSection(systemPrompt, patch.appendSystemPrompt)
	}

	const prepend =
		patch.prepend !== undefined ? [...patch.prepend, ...current.prepend] : current.prepend

	return { systemPrompt, prepend }
}

/**
 * Owns the resolution of a conversation's system prompt from a base prompt plus
 * an ordered chain of `start` handlers.
 *
 * Resolution is lazy: handlers run once, on the first {@link ensureStarted} (or
 * {@link systemPrompt}) call, and the result is cached for the lifetime of the
 * conversation.
 */
export class Conversation {
	private readonly bus = new EventBus<ConversationEvents>()
	private readonly baseSystemPrompt: string
	private resolved: ResolvedSystemPrompt | undefined

	constructor(baseSystemPrompt = "") {
		this.baseSystemPrompt = baseSystemPrompt
	}

	/**
	 * Register a `start` handler. Handlers run in registration order when the
	 * conversation is first started. Returns a disposer that unregisters the
	 * handler (only meaningful before {@link ensureStarted} has run).
	 */
	onStart(handler: StartHandler): () => void {
		return this.bus.on("start", (current) => {
			const patch = handler(current)
			return patch === undefined ? current : applyStartPatch(current, patch)
		})
	}

	/**
	 * Resolve and cache the system prompt by folding the seed value through every
	 * registered `start` handler in order. Idempotent: subsequent calls return the
	 * cached result without re-running handlers.
	 */
	ensureStarted(): ResolvedSystemPrompt {
		if (this.resolved === undefined) {
			const seed: ResolvedSystemPrompt = { systemPrompt: this.baseSystemPrompt, prepend: [] }
			this.resolved = this.bus.fold("start", seed)
		}
		return this.resolved
	}

	/** The resolved system-prompt string (starts the conversation if needed). */
	get systemPrompt(): string {
		return this.ensureStarted().systemPrompt
	}

	/** The resolved prepend lines (starts the conversation if needed). */
	get prepend(): readonly string[] {
		return this.ensureStarted().prepend
	}
}
