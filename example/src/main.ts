/**
 * @file bhai WebLLM example · bootstrap.
 *
 * The only file that knows the `index.html` id contract. It resolves every
 * element, wires the custom elements to the two orchestrators, and gets out of
 * the way. All DOM manipulation lives in `components/`, all kernel and engine
 * work in `app/`.
 *
 * Imports `@lucasschirm/bhai` by its published subpath names — never
 * `../../src/*.ts` — so the example exercises the real package boundary.
 */

import { BHAI } from "@lucasschirm/bhai"
import { createMcpPlugin } from "@lucasschirm/bhai/plugins/mcp"
import { type MLCEngineInstance, WebLLM } from "@lucasschirm/bhai/plugins/webllm"
import type { LitTypeahead } from "@lucasschirm/litjs-typeahead"

import { createChatController } from "./app/chat-controller.js"
import { showFatalError } from "./app/fatal-error.js"
import { createMcpController } from "./app/mcp-controller.js"
import { createEngine, hasWebGpu, resolveModels } from "./app/webllm-engine.js"
// Importing the component modules registers their custom elements.
import "./components/cold-start-panel.js"
import "./components/composer.js"
import "./components/conversation-view.js"
import "./components/mcp-add-form.js"
import "./components/mcp-error-dialog.js"
import "./components/mcp-server-list.js"
import "./components/status-indicator.js"
import "./components/telemetry-panel.js"
import { byId } from "./lib/dom.js"

/** Resolve every custom element from the markup in `index.html`. */
function buildUi() {
	return {
		status: byId<BhaiStatusIndicator>("status"),
		modelSelect: byId<LitTypeahead>("model-select"),
		composer: byId<BhaiComposer>("composer"),
		conversation: byId<BhaiConversation>("conversation"),
		telemetry: byId<BhaiTelemetry>("telemetry-stats"),
		coldStart: byId<BhaiColdStart>("cold-start"),
		mcpForm: byId<BhaiMcpAddForm>("mcp-add"),
		mcpDialog: byId<BhaiMcpErrorDialog>("mcp-error-dialog"),
		mcpServerList: byId<BhaiMcpServerList>("mcp-servers"),
	}
}

// The imports above only register classes; type-only imports keep the file honest.
import type { BhaiColdStart } from "./components/cold-start-panel.js"
import type { BhaiComposer } from "./components/composer.js"
import type { BhaiConversation } from "./components/conversation-view.js"
import type { BhaiMcpAddForm } from "./components/mcp-add-form.js"
import type { BhaiMcpErrorDialog } from "./components/mcp-error-dialog.js"
import type { BhaiMcpServerList } from "./components/mcp-server-list.js"
import type { BhaiStatusIndicator } from "./components/status-indicator.js"
import type { BhaiTelemetry } from "./components/telemetry-panel.js"

/** Set up the engine, the kernel, and both orchestrators. */
async function initialize(): Promise<void> {
	const ui = buildUi()

	// WebGPU is required for WebLLM, and nothing below works without it.
	if (!hasWebGpu()) {
		showFatalError(
			"WebGPU unavailable — this demo needs a WebGPU-capable browser (Chrome/Edge 113+).",
			ui,
		)
		return
	}

	try {
		const { modelIds, defaultModelId } = resolveModels()
		if (modelIds.length === 0) {
			showFatalError("No models available in @mlc-ai/web-llm — check your installation.", ui)
			return
		}
		ui.modelSelect.items = modelIds
		ui.modelSelect.value = defaultModelId

		const engine = createEngine((progress, text) => ui.coldStart.show(progress, text))

		const bh = new BHAI()
		// Pre-warmed form: the host owns the engine, which is what lets the chat
		// controller read `runtimeStatsText()` for telemetry.
		//
		// The cast is a structural-typing artifact, not a runtime concern. The
		// driver models the engine with a single streaming `create` signature,
		// while MLCEngine's real `create` is an overload set whose first member is
		// the NON-streaming one — so TypeScript compares against that and reports
		// `stream: true` as incompatible. The call the driver actually makes is
		// exactly the streaming overload.
		const driver = new WebLLM({ engine: engine as unknown as MLCEngineInstance })
		bh.addDriver(driver)

		// The MCP plugin fills the kernel's client-factory seam — without it
		// `bh.addMcp()` refuses to attach anything — and hands back a manager that
		// makes each attached server's state observable. Must be `use()`d before
		// `init()`; the manager is only usable after.
		const mcp = createMcpPlugin()
		bh.use(mcp.plugin)

		await bh.init()

		const chat = createChatController({ bh, engine, driver, ui })
		ui.composer.wire({
			onSend: (text) => void chat.send(text),
			onStop: () => chat.stop(),
		})
		ui.modelSelect.addEventListener("change", (event) => {
			const value = (event as CustomEvent<{ value: string }>).detail?.value
			if (value) void chat.selectModel(value)
		})

		const mcpController = createMcpController({
			manager: mcp.manager,
			serverList: ui.mcpServerList,
			form: ui.mcpForm,
			dialog: ui.mcpDialog,
		})

		// Deliberately not awaited: a slow or dead MCP endpoint must not delay the
		// chat UI, and every outcome lands in the panel either way.
		void mcpController.start()

		// The typeahead shows `defaultModelId` on load, but a programmatic default
		// never fires a `change` event — so bootstrap that conversation here, and
		// the very first message works without touching the picker.
		await chat.selectModel(defaultModelId)
	} catch (error) {
		console.error("Initialization failed:", error)
		showFatalError("Failed to initialize — check the console for details.", ui)
	}
}

document.addEventListener("DOMContentLoaded", () => {
	void initialize()
})
