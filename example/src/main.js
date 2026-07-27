/**
 * @file bhai WebLLM example · orchestration
 *
 * Wires BHAI kernel + WebLLM engine + DOM together. Orchestrates the flow of
 * model loading, message sending, streaming, stats extraction, and UI updates.
 * Calls pure lib functions (`parseRuntimeStats`, etc.) and UI helpers from `ui.js`.
 *
 * All direct DOM querying/mutation lives in `ui.js`; this module focuses on
 * ORCHESTRATION (calling BHAI/engine APIs, calling lib functions, calling `ui.js`
 * render functions).
 */

import { BHAI } from "@lucasschirm/bhai"
import { WebLLM } from "@lucasschirm/bhai/plugins/webllm"
import * as webllm from "@mlc-ai/web-llm"

import { formatSeconds, formatTokens, formatTps } from "./lib/format.js"
import { parseRuntimeStats } from "./lib/stats.js"
import { thermalColor, thermalRatio } from "./lib/thermal.js"
import * as ui from "./ui.js"

/**
 * Curated allowlist of models to display. These will be filtered to only show
 * models that are actually available in the installed @mlc-ai/web-llm version.
 */
const ALLOWLIST = [
	"Qwen3-0.6B-q4f16_1-MLC",
	"Qwen3-1.7B-q4f16_1-MLC",
	"Llama-3.2-1B-Instruct-q4f16_1-MLC",
	"Llama-3.2-3B-Instruct-q4f16_1-MLC",
	"Phi-3.5-mini-instruct-q4f16_1-MLC",
]

/** @type {*} */
let engine = null

/** @type {InstanceType<typeof BHAI>} */
let bh = null

/** @type {InstanceType<typeof WebLLM>} */
let driver = null

/** @type {InstanceType<typeof import('@lucasschirm/bhai').BHAIConversation>} */
let conversation = null

/** Track whether the model has been loaded/warmed up yet this session. */
let modelLoaded = false

/** Track the current turn's start time for TTFT measurement. */
let sendStartTime = null

/** Track the first token time for TTFT calculation. */
let firstTokenTime = null

/** Track whether we're currently generating (true = generating, false = idle). */
let isGenerating = false

/**
 * Track whether the current turn was stopped by the user (via the Stop button).
 * Set only by the Stop handler so the catch block can distinguish a deliberate
 * stop from a real failure — instead of the fragile, over-broad approach of
 * matching the substring "aborted" in an error message (which silently swallows
 * genuine engine errors).
 */
let userAborted = false

/**
 * Initialize the example app: set up engine, BHAI kernel, driver, and event handlers.
 */
async function initialize() {
	// Guard: WebGPU required for WebLLM.
	if (!navigator.gpu) {
		ui.showFatalError(
			"WebGPU unavailable — this demo needs a WebGPU-capable browser (Chrome/Edge 113+).",
		)
		return
	}

	try {
		// Compute the available models: intersect the allowlist with what's really installed.
		const available = ALLOWLIST.filter((id) =>
			webllm.prebuiltAppConfig.model_list.some((m) => m.model_id === id),
		)

		// Fallback: if allowlist is empty, use the full installed list.
		const modelsToShow =
			available.length > 0 ? available : webllm.prebuiltAppConfig.model_list.map((m) => m.model_id)

		if (available.length === 0 && modelsToShow.length === 0) {
			ui.showFatalError("No models available in @mlc-ai/web-llm — check your installation.")
			return
		}

		if (available.length === 0) {
			console.warn("Allowlist models not found; using all available models instead.")
		}

		// Default model selection: prefer Qwen3, fallback to first available.
		const defaultModelId = modelsToShow.find((id) => id.startsWith("Qwen3")) || modelsToShow[0]

		// Populate the model selector UI.
		ui.populateModelSelect(modelsToShow, defaultModelId)

		// Set up the MLCEngine with a progress callback for cold-start feedback.
		engine = new webllm.MLCEngine({
			initProgressCallback: (report) => {
				// report.progress: 0..1, report.text: shard/status string
				ui.showColdStartPanel(report.progress, report.text)
			},
		})

		// Initialize BHAI kernel.
		bh = new BHAI()

		// Register the WebLLM driver (pre-warmed form: host owns the engine).
		driver = new WebLLM({ engine })
		bh.addDriver(driver)

		// Initialize the kernel (runs plugin hooks, resolves models, etc.).
		await bh.init()

		// Wire up UI interactions.
		setupEventHandlers(modelsToShow)

		// Create the conversation for the preselected default model so the very
		// first message works without requiring the user to change the selection.
		// The `<select>` shows `defaultModelId` on load, but a programmatic default
		// never fires a `change` event — so we bootstrap that conversation here.
		await selectModel(defaultModelId)
	} catch (error) {
		console.error("Initialization failed:", error)
		ui.showFatalError("Failed to initialize — check the console for details.")
	}
}

/**
 * Create (or replace) the active conversation for the given model id and wire
 * its streaming events. Called both for the preselected default model on load
 * and whenever the user picks a different model. This does NOT download weights
 * — the driver loads the model lazily on the first `sendMessage`.
 * @param {string} selectedId - the bare MLC model id (without the `webllm/` prefix)
 */
async function selectModel(selectedId) {
	if (!selectedId || !bh) return

	try {
		ui.setComposerState("idle")
		isGenerating = false
		modelLoaded = false
		ui.setStatus("cold", "cold")
		ui.hideColdStartPanel()

		// Create a new conversation with the selected model.
		// `parseThink: true` makes the framework split `<think>...</think>` out of
		// the model's text stream: reasoning arrives as `message.delta` with
		// `kind: "reasoning"` and lands on `message.think`, the answer arrives as
		// `kind: "text"`. WebLLM has no native reasoning channel, so without this
		// the example would have to parse the tags itself.
		conversation = await bh.createConversation({
			model: `webllm/${selectedId}`,
			parseThink: true,
		})

		// Wire conversation events.
		wireConversationEvents()
	} catch (error) {
		console.error("Failed to create conversation:", error)
		ui.showFatalError("Failed to load model — try again.")
	}
}

/**
 * Reload the active conversation from its own snapshot, yielding a fresh, idle
 * conversation instance that preserves the full message history.
 *
 * A conversation owns a single-use `AbortController`: once `abort()` is called
 * (e.g. via the Stop button), its status is stuck at `"aborted"` and its abort
 * signal stays permanently tripped, so every later `sendMessage` silently
 * yields nothing. `loadConversation()` builds a NEW instance with a fresh
 * controller and `idle` status, so reloading from a snapshot un-poisons the
 * conversation while keeping the history intact.
 */
async function refreshConversation() {
	if (!conversation || !bh) return
	try {
		const snapshot = conversation.toJSON()
		conversation = await bh.loadConversation(snapshot)
		wireConversationEvents()
	} catch (error) {
		console.error("Failed to refresh conversation:", error)
	}
}

/**
 * Set up DOM event handlers: model selector, composer input, send button.
 * @param {string[]} availableModels - list of model IDs to select from
 */
function setupEventHandlers(availableModels) {
	const modelSelect = document.getElementById("model-select")
	const composerInput = document.getElementById("composer-input")
	const composerSend = document.getElementById("composer-send")

	// Model selector: create or switch conversation on selection.
	modelSelect.addEventListener("change", async (e) => {
		await selectModel(e.target.value)
	})

	// Composer: send on button click or Enter (no Shift).
	composerSend.addEventListener("click", async () => {
		if (composerSend.dataset.state === "stop") {
			// Stop button: flag the deliberate stop and abort the in-flight request.
			// The in-flight sendMessage() then settles and its `finally` resets the
			// UI and refreshes the (now-aborted) conversation so it stays usable.
			userAborted = true
			if (conversation) {
				try {
					conversation.abort("user stopped")
				} catch (error) {
					console.error("Abort failed:", error)
				}
			}
			return
		}

		// Send button: dispatch the message.
		const text = composerInput.value.trim()
		if (!text || !conversation) return

		await sendMessage(text)
	})

	composerInput.addEventListener("keydown", async (e) => {
		// Enter without Shift = send.
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault()
			const text = composerInput.value.trim()
			if (!text || !conversation) return
			await sendMessage(text)
		}
	})
}

/**
 * Wire up conversation-level events for streaming and state changes.
 */
function wireConversationEvents() {
	if (!conversation) return

	conversation.on("message.delta", ({ delta, kind }) => {
		if (!currentTurnHandle) return

		// Measure time-to-first-token. Outside the `kind` switch on purpose: a turn
		// that opens with reasoning would otherwise not be measured until its first
		// answer token.
		if (firstTokenTime === null) {
			firstTokenTime = performance.now()
		}

		// The conversation was created with `parseThink: true`, so the framework
		// has already split the stream — route each channel to its own region.
		if (kind === "reasoning") {
			ui.appendThoughtDelta(currentTurnHandle, delta)
		} else if (kind === "text") {
			ui.appendAnswerDelta(currentTurnHandle, delta)
		}
	})
}

/**
 * Track the current turn's handle and thought splitter for streaming.
 * @type {string | null}
 */
let currentTurnHandle = null

/**
 * Send a message and drive the agent loop with streaming.
 * @param {string} text - the user message
 */
async function sendMessage(text) {
	if (!conversation) return

	// Recover if a previous turn left the conversation non-idle (e.g. it was
	// aborted, which permanently trips its abort controller). Without this, every
	// later send would silently produce nothing.
	if (conversation.status !== "idle") {
		await refreshConversation()
	}

	isGenerating = true
	userAborted = false
	ui.setComposerState("generating")
	ui.clearEmptyState()

	// Clear and disable the text input during generation. The send button stays
	// ENABLED (as "Stop") so the user can actually cancel — disabling it made the
	// Stop control unclickable.
	const composerInput = document.getElementById("composer-input")
	const composerSend = document.getElementById("composer-send")
	composerInput.value = ""
	composerInput.disabled = true
	composerSend.disabled = false
	composerSend.dataset.state = "stop"

	// Append user message to the DOM.
	ui.appendUserMessage(text)

	// Begin the assistant turn and track its handle for streaming updates.
	currentTurnHandle = ui.beginAssistantTurn()

	// Measure time-to-first-token: reset tracking at the start of each turn.
	sendStartTime = performance.now()
	firstTokenTime = null

	try {
		// If this is the first send ever (model not yet warmed), set status to "warming".
		if (!modelLoaded) {
			ui.setStatus("warming", "warming")
		}

		// Send the message. If the model hasn't been loaded yet, the driver's
		// lazy `ensureModelLoaded` will trigger `engine.reload(...)`, which fires
		// the `initProgressCallback` we registered — that's where cold-start
		// download progress updates come from.
		await conversation.sendMessage(text)

		// Once sendMessage resolves, the turn is complete.
		if (!modelLoaded) {
			modelLoaded = true
			ui.hideColdStartPanel()
			ui.setStatus("ready", "ready")
		}

		// Extract runtime stats and update telemetry.
		try {
			const statsText = await engine.runtimeStatsText()
			const { prefillTps, decodeTps } = parseRuntimeStats(statsText)

			// Compute thermal color based on decode tok/s.
			const decodeRatio = thermalRatio(decodeTps ?? 0)
			const decodeColor = thermalColor(decodeRatio)

			// Read token counts from conversation.usage.
			const { inputTokens = 0, outputTokens = 0 } = conversation.usage || {}

			// Get the real context window from the driver's capabilities.
			const selectedModelId = ui.getSelectedModelId()
			const contextWindow =
				selectedModelId && driver ? driver.capabilities(selectedModelId).contextWindow : undefined

			// Compute context usage if available.
			const contextUsagePercent = contextWindow
				? Math.round((outputTokens / contextWindow) * 100)
				: null

			// Compute actual TTFT.
			const ttftMs = firstTokenTime !== null ? firstTokenTime - sendStartTime : null

			// Update telemetry UI.
			ui.updateTelemetry({
				prefillTps: prefillTps ? formatTps(prefillTps) : "—",
				decodeTps: decodeTps ? formatTps(decodeTps) : "—",
				ttft: ttftMs !== null ? formatSeconds(ttftMs / 1000) : "—",
				inputTokens: formatTokens(inputTokens),
				outputTokens: formatTokens(outputTokens),
				contextWindow,
				contextUsagePercent,
				decodeColor,
				decodeRatio,
			})
		} catch (statsError) {
			console.warn("Failed to extract runtime stats:", statsError)
		}
	} catch (error) {
		if (userAborted) {
			// Deliberate stop — not a failure.
			console.log("Generation stopped by user.")
		} else {
			// Surface the real error instead of swallowing it. A non-fatal inline
			// message keeps the composer usable so the user can retry.
			console.error("Message send failed:", error)
			ui.showTurnError(`Failed to generate a response: ${error?.message ?? error}`)
		}
	} finally {
		// Reset UI state after the turn completes (or fails).
		isGenerating = false
		composerInput.disabled = false
		composerSend.disabled = false
		ui.setComposerState("idle")

		// A stopped or otherwise non-idle conversation is poisoned (single-use
		// abort controller); reload it from its snapshot so the next send works.
		if (userAborted || conversation.status !== "idle") {
			await refreshConversation()
		}

		if (modelLoaded) {
			ui.setStatus("ready", "ready")
		}
	}
}

// Start the app on page load.
document.addEventListener("DOMContentLoaded", () => {
	initialize()
})
