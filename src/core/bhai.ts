// BHAI kernel class — the framework entry point (ARCHITECTURE.md § 6).
//
// Scope of THIS file (TASK_0003): only the constructor and `use()` are
// implemented, and only plugin forms 1 (bare factory function) and 2
// (capability object) are normalized (§ 7.2). Every other § 6 method is
// stubbed with a `// TODO(TASK_XXXX)` comment naming the owning task; calling
// a stub throws so accidental use surfaces immediately rather than silently
// no-op'ing. Form 3 (decorator-stamped class instances, § 7.2 lines 282-316)
// is intentionally NOT detected here — TASK_0007 extends this same `use()`
// method with that form.
//
// ENVIRONMENT BOUNDARY (§ 5): this file uses only web-standard APIs.
// `crypto.randomUUID()` is the only external surface touched, and it is
// available in every supported runtime (browsers, Node ≥ 19, Deno, Bun).
//
// PATH NOTE: TASK_0003 specifies `bhai/src/kernel/bhai.ts`, but the package
// layout already established by TASK_0002 places the kernel under
// `src/core/` (see `src/core/index.ts` and the `./core` subpath export in
// `package.json`). This file follows the existing repo convention to keep
// one kernel directory; the behavioral contract is unchanged.

import type { JSONSchema } from "../types/content.js"

/**
 * Host-supplied constructor options for {@link BHAI}.
 *
 * All fields are stored verbatim by this task and acted on only by later
 * tasks — see the per-field comments. Nothing here is validated or resolved
 * in TASK_0003.
 */
export interface BHAIHostOptions {
	/** Per-plugin configuration values. Wired up fully by TASK_0006. */
	config?: Record<string, unknown>
	/** Qualified `'<driver>/<model>'` ref. Wired up by TASK_0009 / TASK_0023. */
	defaultModel?: string
	/** Base system prompt injected into conversation preambles (TASK_0023 / § 11.6). */
	systemPrompt?: string
}

/**
 * A bare factory function — plugin form 1 (§ 7.2, pi style).
 *
 * The function IS the plugin's `setup`: it runs immediately at `use()` time,
 * receives the {@link BHAI} instance, and registers whatever capabilities it
 * needs by calling kernel methods on that instance.
 */
export type BHAIPluginFactory = (bh: BHAI) => void | Promise<void>

/**
 * A capability object — plugin form 2 (§ 7.2, OpenCode style).
 *
 * Each key is a well-known hook; keys outside this allowlist are rejected
 * synchronously at `use()` time so typos like `initalize` fail fast.
 *
 * SCOPE NOTE: the owning tasks for `tools`, `getMcps`, `auth`, `retriever`,
 * `skillResolver`, `conversationStore`, and `memoryStore` have not landed
 * yet, so those fields are typed loosely (`unknown` / `unknown[]`) here
 * rather than blocking on their real types. Narrowing each field is the
 * owning task's job when it lands — it refines the type, not this file's
 * structure. The allowlist only needs to recognize the *presence* of these
 * keys, which it does regardless of their value type.
 */
export interface BHAIPluginCapabilities {
	name?: string
	initialize?: (ctx: { bh: BHAI }) => void | Promise<void>
	dispose?: (ctx: { bh: BHAI }) => void | Promise<void>
	/** Refined to `ModelInfo[]` once TASK_0009 lands; `unknown[]` for now. */
	modelSource?: () => Promise<unknown[]>
	/** Refined to `McpServerConfig[]` once TASK_0015 lands. */
	getMcps?: () => Promise<unknown[]>
	/** Refined to `BHAIToolDefinition[]` once TASK_0008 lands. */
	tools?: unknown[]
	/** Refined to `Record<string, BHAICommandDefinition>` once TASK_0010 lands. */
	commands?: Record<string, unknown>
	/** Declares host-supplied plugin configuration (§ 7.4); validated by TASK_0006. */
	configSchema?: JSONSchema
	/** Refined to `CredentialResolver` once TASK_0015 / § 10.4 lands. */
	auth?: unknown
	/** Refined once the § 11.8 RAG task lands. */
	retriever?: unknown
	/** Refined once the § 11.4 skill-resolver task lands. */
	skillResolver?: unknown
	/** Refined once the § 11.4 conversation-store task lands. */
	conversationStore?: unknown
	/** Refined once the § 11.4 memory-store task lands. */
	memoryStore?: unknown
}

/**
 * Anything `use()` accepts — form 1 (factory) or form 2 (capability object).
 * Form 3 (decorator-stamped class instance) is added by TASK_0007.
 */
export type BHAIPluginLike = BHAIPluginFactory | BHAIPluginCapabilities

/**
 * The canonical internal shape every plugin form normalizes to (§ 7.1).
 *
 * The rest of the kernel only ever sees this interface, so it never needs to
 * special-case which form a plugin arrived in. `capabilities` is preserved
 * for later tasks (lifecycle, config, tools) to read hook fields off the
 * original capability object without re-deriving them.
 */
export interface BHAIPlugin {
	/** Unique name; duplicate `use()` calls with the same name are ignored. */
	name: string
	/** Runs immediately at `use()` time (§ 7.3 step 1). */
	setup(bh: BHAI): void | Promise<void>
	/** Original capability object (form 2 only); preserved for later tasks. */
	capabilities?: BHAIPluginCapabilities
}

/** Keys a form-2 capability object may carry (§ 7.2). Any other key is rejected. */
const ALLOWED_CAPABILITY_KEYS: ReadonlySet<string> = new Set([
	"name",
	"initialize",
	"dispose",
	"modelSource",
	"getMcps",
	"tools",
	"commands",
	"configSchema",
	"auth",
	"retriever",
	"skillResolver",
	"conversationStore",
	"memoryStore",
])

/**
 * BHAI is the kernel class — the framework entry point every host
 * instantiates and every plugin registers itself onto.
 *
 * TASK_0003 implements only the constructor and {@link BHAI.use}. Every
 * other method from § 6 is stubbed below with a `// TODO(TASK_XXXX)` comment
 * naming the task that implements it; calling a stub throws.
 */
export class BHAI {
	/** Host options, stored verbatim. Acted on only by later tasks. */
	private readonly options: BHAIHostOptions

	/**
	 * Registered plugins in `use()` order. Order matters for `init()`/`dispose()`
	 * (§ 7.3), so this is an array, not a map. Names are also indexed in
	 * `registeredNames` for O(1) duplicate detection.
	 */
	private readonly plugins: BHAIPlugin[] = []

	/** Names already registered, for idempotent-by-name `use()` (§ 7.1). */
	private readonly registeredNames: Set<string> = new Set()

	/**
	 * Monotonic counter used to give unnamed form-1 factories a stable,
	 * instance-unique suffix in their auto-generated name. Combined with
	 * `crypto.randomUUID()` so two `BHAI` instances in the same process can
	 * never collide.
	 */
	private unnamedCounter = 0

	constructor(options?: BHAIHostOptions) {
		this.options = options ?? {}
	}

	/**
	 * Register a plugin (§ 7). Accepts form 1 (bare factory function) or
	 * form 2 (capability object); form 3 is added by TASK_0007.
	 *
	 * Normalizes either form into the canonical {@link BHAIPlugin} shape,
	 * runs `setup()` immediately (§ 7.3 step 1), and returns `this` for
	 * chaining. Idempotent per *explicit* plugin name: a second `use()` with
	 * the same `name` is a silent no-op (its `setup`/capabilities are never
	 * registered). Unnamed form-1 factories each get a distinct auto-name
	 * and are never treated as duplicates.
	 */
	use(plugin: BHAIPluginLike): this {
		const normalized = this.normalize(plugin)
		if (this.registeredNames.has(normalized.name)) {
			// § 7.1: duplicate use() with the same name is ignored. Do not
			// run setup, do not merge capabilities, do not throw — just bail.
			return this
		}
		this.plugins.push(normalized)
		this.registeredNames.add(normalized.name)
		// § 7.3 step 1: setup() runs immediately at use() time. We do not
		// await it; full async-ordering guarantees are TASK_0005's concern.
		// For form 1, `setup` IS the factory, so this is the call that
		// actually runs the user's plugin body. For form 2, `setup` is a
		// no-op stub (capability hooks run at init()/dispose() time, not now).
		void normalized.setup(this)
		return this
	}

	// ---------------------------------------------------------------------------
	// Stubs for every other § 6 method. Each throws so accidental use fails
	// loudly instead of silently no-op'ing. Implemented by the cited task.
	// ---------------------------------------------------------------------------

	/** TODO(TASK_0004): global event bus (§ 8.1). */
	on(): never {
		throw new Error("bh.on(): not implemented — see TASK_0004")
	}

	/** TODO(TASK_0004): emit a namespaced custom event (§ 8.4). */
	emit(): never {
		throw new Error("bh.emit(): not implemented — see TASK_0004")
	}

	/** TODO(TASK_0005): run plugin `initialize` hooks in use() order (§ 7.3). */
	async init(): Promise<void> {
		throw new Error("bh.init(): not implemented — see TASK_0005")
	}

	/**
	 * TODO(TASK_0023): create a new conversation (§ 11.1).
	 * TASK_0005 implements a partial dispose() for plugin-hook ordering; full
	 * teardown semantics are TASK_0035's.
	 */
	async createConversation(): Promise<never> {
		throw new Error("bh.createConversation(): not implemented — see TASK_0023")
	}

	/** TODO(TASK_0023): load a conversation from a snapshot (§ 11.3). */
	async loadConversation(): Promise<never> {
		throw new Error("bh.loadConversation(): not implemented — see TASK_0023")
	}

	/** TODO(TASK_0008): tool registry (§ 9). */
	addTool(): void {
		throw new Error("bh.addTool(): not implemented — see TASK_0008")
	}

	/** TODO(TASK_0008): tool registry (§ 9). */
	removeTool(): void {
		throw new Error("bh.removeTool(): not implemented — see TASK_0008")
	}

	/** TODO(TASK_0008): tool registry (§ 9). */
	listTools(): never {
		throw new Error("bh.listTools(): not implemented — see TASK_0008")
	}

	/** TODO(TASK_0009): driver registry (§ 10). */
	addDriver(): void {
		throw new Error("bh.addDriver(): not implemented — see TASK_0009")
	}

	/** TODO(TASK_0009): merged model list from drivers + modelSource hooks (§ 10). */
	async listModels(): Promise<never> {
		throw new Error("bh.listModels(): not implemented — see TASK_0009")
	}

	/** TODO(TASK_0032): one-shot LLM call detached from any conversation (§ 6). */
	async complete(): Promise<never> {
		throw new Error("bh.complete(): not implemented — see TASK_0032")
	}

	/** TODO(TASK_0033): embedding side channel — RAG substrate (§ 11.8). */
	async embed(): Promise<never> {
		throw new Error("bh.embed(): not implemented — see TASK_0033")
	}

	/** TODO(TASK_0010): '/slash' command registry (§ 6). */
	addCommand(): void {
		throw new Error("bh.addCommand(): not implemented — see TASK_0010")
	}

	/** TODO(TASK_0015): attach an MCP server (§ 9.2). */
	async addMcp(): Promise<never> {
		throw new Error("bh.addMcp(): not implemented — see TASK_0015")
	}

	/**
	 * TODO(TASK_0005): partial dispose() for plugin-hook ordering (§ 7.3 step 4).
	 * Full teardown (abort in-flight turns, close MCP sessions) is TASK_0035.
	 */
	async dispose(): Promise<void> {
		throw new Error("bh.dispose(): not implemented — see TASK_0005 / TASK_0035")
	}

	// ---------------------------------------------------------------------------
	// Test-only accessors. These exist so TASK_0003's tests can assert internal
	// invariants (plugin count, stored options) without exposing a wider
	// public API. They are intentionally minimal and not part of § 6.
	// ---------------------------------------------------------------------------

	/** @internal Number of normalized plugin records currently registered. */
	__testPluginCount(): number {
		return this.plugins.length
	}

	/** @internal Whether a plugin with the given explicit name is registered. */
	__testHasPlugin(name: string): boolean {
		return this.registeredNames.has(name)
	}

	/** @internal Read-only view of the stored host option for a key. */
	__testOption<K extends keyof BHAIHostOptions>(key: K): BHAIHostOptions[K] {
		return this.options[key]
	}

	// ---------------------------------------------------------------------------
	// Internal normalization.
	// ---------------------------------------------------------------------------

	/**
	 * Detect which supported form `plugin` is and normalize it to a
	 * {@link BHAIPlugin}. Throws synchronously for anything else, including
	 * capability objects with unrecognized keys.
	 */
	private normalize(plugin: BHAIPluginLike): BHAIPlugin {
		if (typeof plugin === "function") {
			return this.normalizeFactory(plugin)
		}
		if (typeof plugin === "object" && plugin !== null) {
			return this.normalizeCapabilities(plugin as BHAIPluginCapabilities)
		}
		throw new Error("bh.use(): plugin must be a function or a capability object")
	}

	/** Form 1: bare factory function. Auto-generates a unique name. */
	private normalizeFactory(fn: BHAIPluginFactory): BHAIPlugin {
		const name = `plugin-${this.unnamedCounter}-${crypto.randomUUID()}`
		this.unnamedCounter += 1
		// `setup` IS the factory — running setup means invoking the user's
		// function with the BHAI instance (done in `use()` above).
		return { name, setup: fn }
	}

	/**
	 * Form 2: capability object. Validates the key allowlist first (fail-fast
	 * on typos), then derives a name and a no-op `setup`. The capability
	 * hooks (`initialize`/`dispose`/etc.) are NOT invoked here — they run at
	 * `bh.init()`/`bh.dispose()` time, which is TASK_0005's job.
	 */
	private normalizeCapabilities(cap: BHAIPluginCapabilities): BHAIPlugin {
		for (const key of Object.keys(cap)) {
			if (!ALLOWED_CAPABILITY_KEYS.has(key)) {
				throw new Error(`bh.use(): unrecognized plugin capability key "${key}"`)
			}
		}
		const name = cap.name ?? `plugin-${this.unnamedCounter}-${crypto.randomUUID()}`
		// Only bump the counter for unnamed capability objects, so the
		// auto-name suffix stays monotonic across both forms.
		if (cap.name === undefined) {
			this.unnamedCounter += 1
		}
		// No user-supplied setup for form 2; hooks are consumed by TASK_0005+.
		const setup = (_bh: BHAI): void => {}
		return { name, setup, capabilities: cap }
	}
}
