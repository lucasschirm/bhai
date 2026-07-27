// TASK_0019 — WebLLM driver plugin tests (§ 10.2).
//
// These tests cover the `WebLLM` class's adapter logic using a hand-written
// fake `MLCEngineInstance` (no real `@mlc-ai/web-llm` dependency needed). They
// test: constructor-injection vs pre-warmed-instance forms, `listModels()`
// mapping, `capabilities()` derivation, `chat()` event translation (deltas,
// tool calls, usage, done events), abort handling, and `driver.progress`
// event dispatch. They do NOT test the real MLC engine, WebGPU, or the retry
// wrapper (TASK_0018).

import { describe, expect, it, vi } from "vitest"

import type { ChatRequest, DriverEvent } from "../../types/index.js"
import { type AppConfig, type MLCEngineInstance, WebLLM } from "./index.js"

/** Build a minimal ChatRequest for testing. */
function makeRequest(overrides: Partial<ChatRequest> = {}): ChatRequest {
	const controller = new AbortController()
	return {
		model: "test-model",
		messages: [],
		signal: controller.signal,
		...overrides,
	}
}

/** Collect all events from an async iterable into an array. */
async function drain(iter: AsyncIterable<DriverEvent>): Promise<DriverEvent[]> {
	const out: DriverEvent[] = []
	for await (const e of iter) out.push(e)
	return out
}

/** A fake MLC engine for testing. */
function fakeEngine(opts?: {
	appConfig?: AppConfig
	chunks?: Array<{
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
	reload?: (modelId: string) => Promise<void>
}): MLCEngineInstance & {
	reload: ReturnType<typeof vi.fn>
	create: ReturnType<typeof vi.fn>
	setProgress: ReturnType<typeof vi.fn>
} {
	const appConfig = opts?.appConfig ?? {
		model_list: [
			{
				model_id: "test-model",
				model: "Test Model 1B",
				model_lib: "test-lib",
			},
		],
	}
	const chunks = opts?.chunks ?? [
		{ choices: [{ delta: { content: "Hello" } }] },
		{ choices: [{ delta: { content: " world" }, finish_reason: "stop" }] },
	]
	const reload = vi.fn(opts?.reload ?? (async () => {}))
	const setProgress = vi.fn()
	const create = vi.fn(async function* (): AsyncIterable<{
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
	}> {
		for (const chunk of chunks) yield chunk
	})
	return {
		chat: { completions: { create } },
		reload,
		setInitProgressCallback: setProgress,
		getAppConfig: () => appConfig,
		// Test-only alias for direct access to the progress spy.
		setProgress,
	} as unknown as MLCEngineInstance & {
		reload: ReturnType<typeof vi.fn>
		create: ReturnType<typeof vi.fn>
		setProgress: ReturnType<typeof vi.fn>
	}
}

describe("WebLLM — constructor", () => {
	it("instantiates the engine when given a constructor", () => {
		const engine = fakeEngine()
		// A constructor that returns the fake engine instance.
		const ctor = vi.fn(() => engine) as unknown as new () => MLCEngineInstance
		const driver = new WebLLM({ engine: ctor })
		expect(driver.id).toBe("webllm")
		expect(ctor).toHaveBeenCalledTimes(1)
	})

	it("uses a pre-warmed instance directly without re-instantiating", () => {
		const engine = fakeEngine()
		const driver = new WebLLM({ engine })
		expect(driver.id).toBe("webllm")
	})

	it("registers an init-progress callback in constructor form", () => {
		const engine = fakeEngine()
		const ctor = vi.fn(() => engine) as unknown as new () => MLCEngineInstance
		new WebLLM({ engine: ctor })
		expect(engine.setInitProgressCallback).toHaveBeenCalledTimes(1)
	})
})

describe("WebLLM — listModels", () => {
	it("maps the engine's app config into ModelInfo[]", async () => {
		const engine = fakeEngine({
			appConfig: {
				model_list: [
					{
						model_id: "model-a",
						model: "Model A",
						model_lib: "lib-a",
						overrides: { toolCalls: true, context_window_size: 4096 },
					},
					{
						model_id: "model-b",
						model: "Model B",
						model_lib: "lib-b",
					},
				],
			},
		})
		const driver = new WebLLM({ engine })
		const models = await driver.listModels()
		expect(models).toHaveLength(2)
		expect(models[0]).toEqual({
			ref: "webllm/model-a",
			driver: "webllm",
			id: "model-a",
			label: "Model A",
			capabilities: {
				streaming: true,
				toolCalls: true,
				reasoning: false,
				embeddings: false,
				contextWindow: 4096,
			},
			availability: "downloadable",
			meta: {
				model: "Model A",
				model_lib: "lib-a",
				overrides: { toolCalls: true, context_window_size: 4096 },
			},
		})
		expect(models[1].capabilities.toolCalls).toBe(false)
		expect(models[1].capabilities.contextWindow).toBeUndefined()
	})

	it("returns [] when the engine has no getAppConfig", async () => {
		const engine = fakeEngine()
		// Remove getAppConfig to simulate an engine that doesn't expose it.
		const { getAppConfig: _, ...rest } = engine
		void _
		const driver = new WebLLM({ engine: rest as MLCEngineInstance })
		const models = await driver.listModels()
		expect(models).toEqual([])
	})

	it("uses the host-supplied appConfig override instead of the engine's", async () => {
		const engine = fakeEngine({
			appConfig: {
				model_list: [{ model_id: "engine-model", model: "Engine", model_lib: "lib" }],
			},
		})
		const override: AppConfig = {
			model_list: [{ model_id: "override-model", model: "Override", model_lib: "olib" }],
		}
		const driver = new WebLLM({ engine, appConfig: override })
		const models = await driver.listModels()
		expect(models).toHaveLength(1)
		expect(models[0].id).toBe("override-model")
	})
})

describe("WebLLM — capabilities", () => {
	it("derives toolCalls from overrides.toolCalls", () => {
		const engine = fakeEngine({
			appConfig: {
				model_list: [
					{
						model_id: "m1",
						model: "M1",
						model_lib: "l1",
						overrides: { toolCalls: true },
					},
				],
			},
		})
		const driver = new WebLLM({ engine })
		expect(driver.capabilities("m1").toolCalls).toBe(true)
		expect(driver.capabilities("m1").streaming).toBe(true)
		expect(driver.capabilities("m1").reasoning).toBe(false)
		expect(driver.capabilities("m1").embeddings).toBe(false)
	})

	it("defaults toolCalls to false when no overrides", () => {
		const engine = fakeEngine()
		const driver = new WebLLM({ engine })
		expect(driver.capabilities("test-model").toolCalls).toBe(false)
	})

	it("reads contextWindow from overrides.context_window_size", () => {
		const engine = fakeEngine({
			appConfig: {
				model_list: [
					{
						model_id: "m1",
						model: "M1",
						model_lib: "l1",
						overrides: { context_window_size: 8192 },
					},
				],
			},
		})
		const driver = new WebLLM({ engine })
		expect(driver.capabilities("m1").contextWindow).toBe(8192)
	})
})

describe("WebLLM — chat", () => {
	it("translates text deltas and a stop finish_reason", async () => {
		const engine = fakeEngine({
			chunks: [
				{ choices: [{ delta: { content: "Hi" } }] },
				{ choices: [{ delta: { content: " there" }, finish_reason: "stop" }] },
			],
		})
		const driver = new WebLLM({ engine })
		const events = await drain(driver.chat(makeRequest()))
		expect(events).toEqual([
			{ type: "delta", text: "Hi" },
			{ type: "delta", text: " there" },
			{ type: "done", stopReason: "stop" },
		])
	})

	it("translates tool_calls and maps finish_reason to tool-calls", async () => {
		const engine = fakeEngine({
			appConfig: {
				model_list: [
					{
						model_id: "test-model",
						model: "M",
						model_lib: "l",
						overrides: { toolCalls: true },
					},
				],
			},
			chunks: [
				{
					choices: [
						{
							delta: {
								tool_calls: [
									{
										id: "call-1",
										function: { name: "get_weather", arguments: '{"city":"SF"}' },
									},
								],
							},
							finish_reason: "tool_calls",
						},
					],
				},
			],
		})
		const driver = new WebLLM({ engine })
		const events = await drain(driver.chat(makeRequest()))
		expect(events).toEqual([
			{
				type: "tool-call",
				toolCallId: "call-1",
				name: "get_weather",
				input: { city: "SF" },
			},
			{ type: "done", stopReason: "tool-calls" },
		])
	})

	it("emits a usage event when the chunk carries usage", async () => {
		const engine = fakeEngine({
			chunks: [
				{
					choices: [{ delta: { content: "ok" }, finish_reason: "stop" }],
					usage: { prompt_tokens: 10, completion_tokens: 5 },
				},
			],
		})
		const driver = new WebLLM({ engine })
		const events = await drain(driver.chat(makeRequest()))
		expect(events).toContainEqual({
			type: "usage",
			inputTokens: 10,
			outputTokens: 5,
		})
	})

	it("maps finish_reason 'length' to stopReason 'length'", async () => {
		const engine = fakeEngine({
			chunks: [{ choices: [{ delta: { content: "..." }, finish_reason: "length" }] }],
		})
		const driver = new WebLLM({ engine })
		const events = await drain(driver.chat(makeRequest()))
		expect(events.at(-1)).toEqual({ type: "done", stopReason: "length" })
	})

	it("yields a default stop when the stream ends without finish_reason", async () => {
		const engine = fakeEngine({
			chunks: [{ choices: [{ delta: { content: "no finish" } }] }],
		})
		const driver = new WebLLM({ engine })
		const events = await drain(driver.chat(makeRequest()))
		expect(events).toEqual([
			{ type: "delta", text: "no finish" },
			{ type: "done", stopReason: "stop" },
		])
	})

	it("emits done with stopReason 'error' on invalid tool-call arguments JSON", async () => {
		const engine = fakeEngine({
			appConfig: {
				model_list: [
					{
						model_id: "test-model",
						model: "M",
						model_lib: "l",
						overrides: { toolCalls: true },
					},
				],
			},
			chunks: [
				{
					choices: [
						{
							delta: {
								tool_calls: [
									{
										id: "call-1",
										function: { name: "bad", arguments: "not-json" },
									},
								],
							},
						},
					],
				},
			],
		})
		const driver = new WebLLM({ engine })
		const events = await drain(driver.chat(makeRequest()))
		expect(events).toHaveLength(1)
		expect(events[0].type).toBe("done")
		if (events[0].type === "done") {
			expect(events[0].stopReason).toBe("error")
			expect(events[0].error).toBeInstanceOf(SyntaxError)
		}
	})

	it("yields done with stopReason 'abort' when the signal fires", async () => {
		const controller = new AbortController()
		const engine = fakeEngine({
			chunks: [
				{ choices: [{ delta: { content: "partial" } }] },
				{ choices: [{ delta: { content: " more" } }] },
			],
		})
		const driver = new WebLLM({ engine })
		// Abort before iterating so the first chunk check triggers.
		controller.abort()
		const events = await drain(driver.chat(makeRequest({ signal: controller.signal })))
		expect(events).toEqual([{ type: "done", stopReason: "abort" }])
	})

	it("rethrows unexpected engine exceptions", async () => {
		const engine = fakeEngine()
		// Override create to throw.
		engine.chat.completions.create = vi.fn(
			(): AsyncIterable<{
				choices: unknown[]
			}> => ({
				async *[Symbol.asyncIterator]() {
					const shouldThrow = true
					if (shouldThrow) throw new Error("engine boom")
					yield {} as { choices: unknown[] }
				},
			}),
		) as typeof engine.chat.completions.create
		const driver = new WebLLM({ engine })
		await expect(drain(driver.chat(makeRequest()))).rejects.toThrow("engine boom")
	})
})

describe("WebLLM — model loading", () => {
	it("calls reload on the first chat() for a new model (constructor form)", async () => {
		const engine = fakeEngine()
		const ctor = vi.fn(() => engine) as unknown as new () => MLCEngineInstance
		const driver = new WebLLM({ engine: ctor })
		await drain(driver.chat(makeRequest({ model: "test-model" })))
		expect(engine.reload).toHaveBeenCalledWith("test-model")
	})

	it("does not call reload on subsequent chat() calls for the same model", async () => {
		const engine = fakeEngine()
		const driver = new WebLLM({ engine })
		await drain(driver.chat(makeRequest({ model: "test-model" })))
		await drain(driver.chat(makeRequest({ model: "test-model" })))
		expect(engine.reload).toHaveBeenCalledTimes(1)
	})

	it("calls reload when switching to a different model", async () => {
		const engine = fakeEngine({
			appConfig: {
				model_list: [
					{ model_id: "model-a", model: "A", model_lib: "la" },
					{ model_id: "model-b", model: "B", model_lib: "lb" },
				],
			},
		})
		const driver = new WebLLM({ engine })
		await drain(driver.chat(makeRequest({ model: "model-a" })))
		await drain(driver.chat(makeRequest({ model: "model-b" })))
		expect(engine.reload).toHaveBeenCalledTimes(2)
		expect(engine.reload).toHaveBeenNthCalledWith(1, "model-a")
		expect(engine.reload).toHaveBeenNthCalledWith(2, "model-b")
	})
})

describe("WebLLM — driver.progress events", () => {
	it("fires driver.progress events via the dispatch callback", async () => {
		const engine = fakeEngine()
		const ctor = vi.fn(() => engine) as unknown as new () => MLCEngineInstance
		const dispatched: Array<{ event: string; payload: unknown }> = []
		const driver = new WebLLM({
			engine: ctor,
			dispatch: (event, payload) => {
				dispatched.push({ event, payload })
			},
		})
		// Simulate an init-progress report from the engine.
		expect(engine.setProgress).toHaveBeenCalledTimes(1)
		const cb = engine.setProgress.mock.calls[0][0] as (report: {
			progress: number
			text: string
		}) => void
		cb({ progress: 0.5, text: "Downloading..." })
		await drain(driver.chat(makeRequest()))
		expect(dispatched).toEqual([
			{
				event: "driver.progress",
				payload: {
					driver: "webllm",
					model: undefined,
					progress: 0.5,
					text: "Downloading...",
				},
			},
		])
	})
})
