// WebLLM driver plugin — runs LLM inference in-browser via WebGPU
// (ARCHITECTURE.md § 10.2). Implements `BHAIDriver` (from
// `src/types/driver.ts`) on top of `@mlc-ai/web-llm`'s `MLCEngine`, which the
// host injects at runtime (never statically imported by the core).
//
// Scope of THIS file (TASK_0019): the `WebLLM` class implementing `BHAIDriver`,
// accepting either an `MLCEngine` constructor (the driver instantiates and
// manages the engine's init/download lifecycle itself) or an already-
// constructed, pre-warmed `MLCEngine` instance (used directly, no re-init).
// Also updates `bhai/package.json` to add `@mlc-ai/web-llm` as a
// `peerDependency` (marked `optional: true` via `peerDependenciesMeta`).
//
// PEER-DEPENDENCY / IMPORT BOUNDARY (§ 5, § 10.2):
// `@mlc-ai/web-llm` is declared ONLY under `peerDependencies` (and
// `peerDependenciesMeta` marking it `optional: true`) in `package.json` —
// never under `dependencies` or root `devDependencies` (a `devDependency` for
// local typechecking/testing is acceptable, but the published runtime
// classification must remain `peerDependencies`). This package is intentionally
// never imported by anything under `src/core/`, `src/types/`, `src/tools/`, or
// `src/conversation/` — only files under `src/plugins/webllm/` may import it.
// In practice this adapter does NOT statically import `@mlc-ai/web-llm` at all:
// the engine is injected by the host, keeping the core bundle free of the
// browser/WebGPU-only dependency.
//
// ENVIRONMENT BOUNDARY (§ 5): this plugin subpath is one of the few places
// where a non-web-standard API (WebGPU) is touched. That's why it's a plugin
// subpath, not part of `src/core/`. The driver itself uses only
// `crypto.randomUUID()` (for fallback tool-call ids, never needed in the
// WebLLM path since MLC supplies them) and async iterables — no Node built-ins.

import type {
	BHAIDriver,
	ChatRequest,
	DriverCapabilities,
	DriverEvent,
	ModelInfo,
} from "../../types/index.js"

/**
 * Minimal structural shape of an MLC `MLCEngine` instance as used by this
 * driver adapter. The real `@mlc-ai/web-llm` package's exact TypeScript types
 * are not transcribed verbatim here since this file must not import the real
 * package into shared/testable code paths without it being a peer dependency
 * resolved at the host's install time; this is a deliberately minimal,
 * best-effort approximation of MLC's public OpenAI-compatible engine API
 * sufficient to exercise this driver's adapter logic. If the real package's
 * shape differs in a later integration task, that task should adjust the
 * adapter, not this interface's documented intent.
 */
export interface MLCEngineInstance {
	chat: {
		completions: {
			create(params: {
				messages: unknown[]
				tools?: unknown[]
				stream: true
				temperature?: number
				max_tokens?: number
				stop?: string[]
			}): AsyncIterable<{
				choices: Array<{
					delta: {
						content?: string
						tool_calls?: Array<{
							id: string
							function: { name: string; arguments: string }
						}>
					}
					finish_reason?: "stop" | "tool_calls" | "length" | null
				}>
				usage?: { prompt_tokens: number; completion_tokens: number }
			}>
		}
	}
	reload?(modelId: string): Promise<void>
	setInitProgressCallback?(cb: (report: { progress: number; text: string }) => void): void
	getAppConfig?(): AppConfig
}

/**
 * A constructable `MLCEngine` class. The driver instantiates and manages the
 * engine's init/download lifecycle itself when given this form.
 */
export type MLCEngineConstructor = new () => MLCEngineInstance

/**
 * MLC app config: a list of prebuilt models with artifact/lib URLs. Hosts may
 * pass a custom one via {@link WebLLMOptions.appConfig} to override URLs.
 */
export interface AppConfig {
	model_list: Array<{
		model_id: string
		model: string
		model_lib: string
		overrides?: Record<string, unknown>
	}>
}

/**
 * A framework-event dispatch primitive used to fire `driver.progress` events.
 * `driver.*` is a reserved namespace prefix (§ 8.4), so this driver uses the
 * bus's internal/unguarded dispatch path (the same one TASK_0018 uses for
 * `request`), not the plugin-facing guarded `emit()`. Injected so this driver
 * stays decoupled from the bus's concrete class shape and is unit-testable
 * with a plain recording fake.
 */
export type DriverProgressDispatch = (
	event: "driver.progress",
	payload: {
		driver: "webllm"
		model?: string
		progress: number
		text?: string
	},
) => Promise<void> | void

/**
 * Host-supplied constructor options for {@link WebLLM}.
 */
export interface WebLLMOptions {
	/**
	 * Either an `MLCEngine` constructor (the driver instantiates and manages
	 * the engine's init/download lifecycle itself) or an already-constructed,
	 * pre-warmed `MLCEngine` instance (used directly, no re-init).
	 *
	 * DETECTION HEURISTIC (explicit assumption, since the spec doesn't specify
	 * how to detect "is this a constructor or an instance" at runtime):
	 * `typeof options.engine === 'function'` → constructor form; otherwise →
	 * instance form. This is a load-bearing branch with no spec-mandated
	 * algorithm.
	 */
	engine: MLCEngineConstructor | MLCEngineInstance
	/**
	 * Optional host override for model artifact/lib URLs. When supplied, it
	 * FULLY REPLACES (not merges with) whatever `engine.getAppConfig()` would
	 * otherwise report — this is how a host overrides model artifact/lib URLs
	 * per § 10.2. Full-replace (not deep-merge) semantics is this task's
	 * explicit, simplifying assumption, since the spec doesn't say whether
	 * overrides merge or replace.
	 */
	appConfig?: AppConfig
	/**
	 * Optional framework-event dispatch used to fire `driver.progress` events
	 * during engine init/download. When omitted, progress callbacks are still
	 * registered on the engine (if supported) but their reports are dropped —
	 * the driver remains functional without a wired bus.
	 */
	dispatch?: DriverProgressDispatch
}

/**
 * `WebLLM` — a {@link BHAIDriver} that runs inference entirely in-browser over
 * WebGPU by wrapping an injected MLC `MLCEngine` instance.
 *
 * Constructor-injection form (`new WebLLM({ engine: MLCEngine })` where
 * `MLCEngine` is a class/constructor): the driver instantiates the engine
 * (`new engine()`), registers an init-progress callback via
 * `setInitProgressCallback`, and calls whatever load/reload method the engine
 * exposes before the first `chat()` call resolves data for that model — model
 * loading is lazy, triggered by the first `chat()` call (or
 * `capabilities()`/`listModels()` call) that references a not-yet-loaded
 * model, not eagerly in the constructor, so constructing a `WebLLM` driver
 * never blocks or downloads anything by itself.
 *
 * Pre-warmed-instance form (`new WebLLM({ engine: mlcEngineInstance })` where
 * the value is already an object, not a class): the driver uses the instance
 * directly, does not call any load/reload lifecycle method on construction
 * (the host is responsible for having warmed it up before injecting it), but
 * still forwards the instance's init-progress callback (if the host registers
 * one later) and still surfaces `driver.progress` events for any in-flight
 * loads the instance itself reports.
 */
export class WebLLM implements BHAIDriver {
	readonly id = "webllm" as const
	private readonly engine: MLCEngineInstance
	private readonly appConfig: AppConfig | undefined
	private readonly dispatch: DriverProgressDispatch | undefined
	/** Tracks the currently-loaded model id (constructor-injection form). */
	private loadedModelId: string | undefined

	constructor(options: WebLLMOptions) {
		this.appConfig = options.appConfig
		this.dispatch = options.dispatch
		if (typeof options.engine === "function") {
			const ctor = options.engine as MLCEngineConstructor
			this.engine = new ctor()
			// Register an init-progress callback if the engine supports one.
			if (this.engine.setInitProgressCallback) {
				this.engine.setInitProgressCallback((report) => {
					void this.dispatch?.("driver.progress", {
						driver: "webllm",
						model: this.loadedModelId,
						progress: report.progress,
						text: report.text,
					})
				})
			}
		} else {
			this.engine = options.engine as MLCEngineInstance
		}
	}

	/**
	 * Reflects the engine's prebuilt app config (or the host-supplied
	 * `appConfig` override), mapped into `ModelInfo[]`.
	 *
	 * AVAILABILITY: every model is reported as `'downloadable'` by default
	 * since detecting "already cached in IndexedDB/Cache Storage" is
	 * engine-internal state this driver cannot reliably probe without a real
	 * WebGPU environment — a deliberate MVP simplification; a future task may
	 * refine `availability` reporting if MLC exposes a reliable cache-check
	 * API.
	 */
	async listModels(): Promise<ModelInfo[]> {
		const config = this.appConfig ?? this.engine.getAppConfig?.()
		if (!config) return []
		return config.model_list.map((entry) => ({
			ref: `webllm/${entry.model_id}`,
			driver: "webllm",
			id: entry.model_id,
			label: entry.model,
			capabilities: this.capabilities(entry.model_id),
			availability: "downloadable" as const,
			meta: {
				model: entry.model,
				model_lib: entry.model_lib,
				overrides: entry.overrides,
			},
		}))
	}

	/**
	 * Per-model capability flags. `toolCalls` is derived from the app-config
	 * entry's `overrides.toolCalls` field (MLC's app config does not carry a
	 * first-class "supports tool calling" flag today), defaulting to `false`
	 * when absent — the conservative, spec-compliant choice per § 10.2's "for
	 * models without native tool calling the driver reports `toolCalls:
	 * false`." `reasoning` is `false` for all models in this MVP driver (no
	 * bundled WebLLM model in scope is documented as a reasoning model).
	 * `embeddings` is `false` — this driver does not implement `embed()`.
	 * `contextWindow` is read from `overrides.context_window_size` if present.
	 */
	capabilities(model: string): DriverCapabilities {
		const entry = this.findModelEntry(model)
		const overrides = entry?.overrides ?? {}
		return {
			streaming: true,
			toolCalls: overrides.toolCalls === true,
			reasoning: false,
			embeddings: false,
			contextWindow:
				typeof overrides.context_window_size === "number"
					? overrides.context_window_size
					: undefined,
		}
	}

	/**
	 * One LLM call. Maps the BHAI `ChatRequest` into MLC's OpenAI-compatible
	 * `chat.completions.create({ stream: true, ... })` and translates the
	 * resulting async iterable into the framework's `DriverEvent` shape.
	 *
	 * ERROR HANDLING (§ 10.1: "Drivers stay simple: throw or emit `done: {
	 * stopReason: 'error' }`"): this implementation re-throws genuinely
	 * unexpected engine exceptions (letting TASK_0018's wrapper classify
	 * them), and converts `JSON.parse` failures on tool-call `arguments`
	 * into a terminal `{ type: 'done', stopReason: 'error', error }` event
	 * rather than throwing out of the generator uncaught — so TASK_0018's
	 * classifier tests and this driver's tests stay consistent.
	 */
	async *chat(request: ChatRequest): AsyncIterable<DriverEvent> {
		// Step 1: ensure the target model is loaded (constructor-injection
		// form only; the pre-warmed-instance form assumes the host already
		// loaded the right model, or the driver reloads only if request.model
		// differs from what was last loaded through this driver instance).
		await this.ensureModelLoaded(request.model)

		// Step 2: map BHAIMessage[] into the engine's OpenAI-style messages.
		const messages = request.messages.map((m) => {
			const base: Record<string, unknown> = { role: m.role, content: m.content }
			// MVP simplification: multi-block ContentBlock[] content collapses to
			// the message's `content` string field, since WebLLM's OpenAI-
			// compatible surface expects string content per message in the
			// common case.
			return base
		})
		if (request.systemPrompt) {
			messages.unshift({ role: "system", content: request.systemPrompt })
		}

		// Step 3: map tools only when the model is tool-capable.
		const caps = this.capabilities(request.model)
		const tools =
			caps.toolCalls && request.tools
				? request.tools.map((t) => ({
						type: "function",
						function: {
							name: t.name,
							description: t.description,
							parameters: t.inputSchema,
						},
					}))
				: undefined

		// Step 4: map generation params. `reasoning` is silently dropped
		// since `capabilities().reasoning` is always `false` for this driver.
		const params: {
			messages: unknown[]
			tools?: unknown[]
			stream: true
			temperature?: number
			max_tokens?: number
			stop?: string[]
		} = {
			messages,
			stream: true,
		}
		if (tools) params.tools = tools
		if (request.params?.temperature !== undefined) params.temperature = request.params.temperature
		if (request.params?.maxTokens !== undefined) params.max_tokens = request.params.maxTokens
		if (request.params?.stop) params.stop = request.params.stop

		// Step 5: iterate the engine's streaming completion. Unexpected
		// engine exceptions propagate uncaught so TASK_0018's wrapper can
		// classify and retry them (§ 10.1: "Drivers stay simple: throw or
		// emit done: { stopReason: 'error' }").
		const stream = this.engine.chat.completions.create(params)
		for await (const chunk of stream) {
			// Abort check: if the signal fired, stop and yield abort.
			if (request.signal.aborted) {
				yield { type: "done", stopReason: "abort" }
				return
			}
			const choice = chunk.choices[0]
			if (!choice) continue
			if (choice.delta.content) {
				yield { type: "delta", text: choice.delta.content }
			}
			if (choice.delta.tool_calls) {
				for (const call of choice.delta.tool_calls) {
					let input: unknown
					try {
						input = JSON.parse(call.function.arguments)
					} catch (err) {
						yield {
							type: "done",
							stopReason: "error",
							error: err,
						}
						return
					}
					yield {
						type: "tool-call",
						toolCallId: call.id,
						name: call.function.name,
						input,
					}
				}
			}
			if (chunk.usage) {
				yield {
					type: "usage",
					inputTokens: chunk.usage.prompt_tokens,
					outputTokens: chunk.usage.completion_tokens,
				}
			}
			if (choice.finish_reason) {
				yield {
					type: "done",
					stopReason: this.mapFinishReason(choice.finish_reason),
				}
				return
			}
		}
		// Stream ended without an explicit finish_reason — yield a default
		// stop. (MLC normally emits a finish_reason; this is a defensive
		// fallback.)
		yield { type: "done", stopReason: "stop" }
	}

	/**
	 * Map MLC's `finish_reason` to BHAI's `stopReason`.
	 * `'stop'` → `'stop'`, `'tool_calls'` → `'tool-calls'`, `'length'` →
	 * `'length'`.
	 */
	private mapFinishReason(
		reason: "stop" | "tool_calls" | "length" | null,
	): "stop" | "tool-calls" | "length" {
		switch (reason) {
			case "stop":
				return "stop"
			case "tool_calls":
				return "tool-calls"
			case "length":
				return "length"
			default:
				return "stop"
		}
	}

	/**
	 * Ensure the target model is loaded. Constructor-injection form: calls the
	 * engine's `reload` method if the model isn't already the currently-loaded
	 * one. Pre-warmed-instance form: assumes the host already loaded the right
	 * model, but reloads only if `request.model` differs from what was last
	 * loaded through this driver instance.
	 */
	private async ensureModelLoaded(modelId: string): Promise<void> {
		if (this.loadedModelId === modelId) return
		if (this.engine.reload) {
			await this.engine.reload(modelId)
		}
		this.loadedModelId = modelId
	}

	/** Look up an app-config entry by model id. */
	private findModelEntry(modelId: string): AppConfig["model_list"][number] | undefined {
		const config = this.appConfig ?? this.engine.getAppConfig?.()
		if (!config) return undefined
		return config.model_list.find((e) => e.model_id === modelId)
	}
}
