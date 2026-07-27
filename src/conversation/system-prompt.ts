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

/**
 * The slice of the kernel a {@link Conversation} needs in order to inherit
 * global plugin activation state.
 *
 * Declared structurally rather than importing `BHAI` so `src/conversation/`
 * stays independent of `src/core/` — the two subtrees are deliberately
 * decoupled (`src/index.ts` even has to alias one's `EventBus` around the
 * other's). A `BHAI` instance satisfies this interface without declaring it.
 */
export interface PluginActivationSource {
	/** Whether `name` is currently active kernel-wide. */
	isPluginEnabled(name: string): boolean
	/** Every registered plugin, in registration order. */
	listPlugins(): Array<{ name: string }>
}

/** Construction options for a {@link Conversation}. */
export interface ConversationOptions {
	/**
	 * Kernel whose global plugin activation this conversation inherits. Omit for
	 * a standalone conversation, in which case every handler always runs and the
	 * per-conversation overrides below still work for any owner name you use.
	 */
	bhai?: PluginActivationSource
}

/** One plugin's activation state as seen by a single conversation. */
export interface ConversationPluginStatus {
	name: string
	/** The kernel-wide state this conversation would inherit. */
	globalEnabled: boolean
	/** This conversation's override: `undefined` means "inherit". */
	override: boolean | undefined
	/** What actually applies here — `override ?? globalEnabled`. */
	effective: boolean
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

	/** Kernel supplying global plugin activation state, if this conversation has one. */
	private readonly source: PluginActivationSource | undefined

	/**
	 * Per-conversation activation overrides. A key present means this
	 * conversation has taken an explicit position on that plugin; a key absent
	 * means "inherit whatever the kernel says". That three-state distinction is
	 * why this is a `Map` to `boolean` rather than a `Set` of disabled names —
	 * a conversation must be able to force a plugin ON that is globally off.
	 */
	private readonly overrides: Map<string, boolean> = new Map()

	constructor(baseSystemPrompt = "", options: ConversationOptions = {}) {
		this.baseSystemPrompt = baseSystemPrompt
		this.source = options.bhai
	}

	/**
	 * Register a `start` handler. Handlers run in registration order when the
	 * conversation is first started. Returns a disposer that unregisters the
	 * handler (only meaningful before {@link ensureStarted} has run).
	 *
	 * `owner` attributes the handler to a plugin, so it is skipped while that
	 * plugin is inactive for this conversation ({@link isPluginEnabled}). A
	 * handler registered without an `owner` — which every pre-existing caller
	 * does — is host-owned and always runs.
	 *
	 * A skipped handler leaves the running value untouched, exactly as a handler
	 * returning `undefined` does, so deactivating a plugin is indistinguishable
	 * from it never having registered anything.
	 */
	onStart(handler: StartHandler, owner?: string): () => void {
		return this.bus.on("start", (current) => {
			if (owner !== undefined && !this.isPluginEnabled(owner)) {
				return current
			}
			const patch = handler(current)
			return patch === undefined ? current : applyStartPatch(current, patch)
		})
	}

	// ---------------------------------------------------------------------------
	// Per-conversation plugin activation.
	// ---------------------------------------------------------------------------

	/**
	 * Force `name` ON for this conversation, whatever the kernel says. Overrides
	 * a global deactivation.
	 */
	enablePlugin(name: string): this {
		this.overrides.set(name, true)
		return this
	}

	/**
	 * Force `name` OFF for this conversation, leaving every other conversation
	 * and the kernel itself untouched.
	 */
	disablePlugin(name: string): this {
		this.overrides.set(name, false)
		return this
	}

	/**
	 * Drop this conversation's override for `name`, returning it to inheriting
	 * the kernel's state. A no-op if no override was set.
	 */
	resetPlugin(name: string): this {
		this.overrides.delete(name)
		return this
	}

	/**
	 * Whether `name` is active for this conversation: its override if one is set,
	 * otherwise the kernel's global state. With no kernel and no override, the
	 * answer is `true` — a standalone conversation gates nothing.
	 */
	isPluginEnabled(name: string): boolean {
		const override = this.overrides.get(name)
		if (override !== undefined) return override
		return this.source?.isPluginEnabled(name) ?? true
	}

	/**
	 * Every plugin the kernel knows about, with the global state, this
	 * conversation's override, and the effective result. Empty when this
	 * conversation has no kernel — overrides can still be set against arbitrary
	 * owner names, there is just no plugin list to enumerate.
	 */
	listPlugins(): ConversationPluginStatus[] {
		const plugins = this.source?.listPlugins() ?? []
		return plugins.map(({ name }) => ({
			name,
			globalEnabled: this.source?.isPluginEnabled(name) ?? true,
			override: this.overrides.get(name),
			effective: this.isPluginEnabled(name),
		}))
	}

	/**
	 * Discard the cached resolution so the next read re-runs every `start`
	 * handler against the current activation state.
	 *
	 * Needed because resolution is cached for the conversation's lifetime (see
	 * {@link ensureStarted}), which means a toggle made after the conversation
	 * has already started has no effect on its own. That is the intended default:
	 * a running conversation's system prompt should not mutate underneath it just
	 * because a plugin was switched off elsewhere. `restart()` is how a caller
	 * explicitly opts into re-resolving, accepting that every handler runs again.
	 */
	restart(): void {
		this.resolved = undefined
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
