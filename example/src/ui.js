/**
 * @file bhai WebLLM example · DOM helpers
 *
 * Exports plain functions for DOM querying, rendering, and updates.
 * All direct DOM manipulation lives here; main.js calls these functions
 * for orchestration and never touches the DOM directly.
 */

import { formatSeconds, formatTokens, formatTps } from "./lib/format.js"
import { errorHint } from "./lib/mcp-store.js"
import { thermalColor } from "./lib/thermal.js"

/**
 * The telemetry rail's stats region — the part that is re-rendered wholesale
 * after every turn. Deliberately NOT `#telemetry` itself: the MCP panel is a
 * sibling inside the same rail, and blowing away the aside's innerHTML would
 * take the panel (and the user's configured servers) with it.
 * @returns {HTMLElement | null}
 */
function statsRegion() {
	return document.getElementById("telemetry-stats")
}

/**
 * Display a fatal error message that blocks further interaction.
 * @param {string} message - error description
 */
export function showFatalError(message) {
	const telemetry = statsRegion()
	if (telemetry) {
		const errorDiv = document.createElement("div")
		errorDiv.style.color = "var(--warm)"
		errorDiv.style.padding = "1rem"
		errorDiv.textContent = message
		telemetry.innerHTML = ""
		telemetry.appendChild(errorDiv)
	}

	const composer = document.querySelector(".composer")
	if (composer) {
		composer.style.display = "none"
	}
}

/**
 * Show a non-fatal, per-turn error inside the conversation stream. Unlike
 * {@link showFatalError}, this leaves the composer and telemetry intact so the
 * user can read the message and try again.
 * @param {string} message - error description
 */
export function showTurnError(message) {
	const conversation = document.getElementById("conversation")
	if (!conversation) return

	const errorEl = document.createElement("div")
	errorEl.className = "message error"
	errorEl.setAttribute("role", "alert")
	errorEl.textContent = message
	conversation.appendChild(errorEl)
	conversation.scrollTop = conversation.scrollHeight
}

/**
 * Populate the model selector with available models.
 * @param {string[]} modelIds - list of model IDs
 * @param {string} selectedId - model ID to pre-select
 */
export function populateModelSelect(modelIds, selectedId) {
	const select = document.getElementById("model-select")
	if (!select) return

	select.innerHTML = ""

	// Add a placeholder option if needed.
	// const placeholder = document.createElement("option");
	// placeholder.value = "";
	// placeholder.textContent = "Select a model…";
	// select.appendChild(placeholder);

	// Add each model as an option.
	for (const id of modelIds) {
		const option = document.createElement("option")
		option.value = id
		option.textContent = id
		select.appendChild(option)
	}

	// Set the default selection.
	if (selectedId) {
		select.value = selectedId
	}
}

/**
 * Get the currently selected model ID from the selector.
 * @returns {string | null}
 */
export function getSelectedModelId() {
	const select = document.getElementById("model-select")
	return select?.value || null
}

/**
 * Set the status indicator (dot + label).
 * @param {string} state - "cold", "warming", "ready", or "generating"
 * @param {string} label - text to display next to the dot
 */
export function setStatus(state, label) {
	const dot = document.getElementById("status-dot")
	const labelEl = document.getElementById("status-label")

	if (dot) {
		dot.dataset.state = state
	}

	if (labelEl) {
		labelEl.textContent = label
	}
}

/**
 * Show the cold-start download progress panel.
 * @param {number} progress - 0..1
 * @param {string} text - status text (e.g., "Downloading shard 3/10…")
 */
export function showColdStartPanel(progress, text) {
	const telemetry = statsRegion()
	if (!telemetry) return

	let panel = document.getElementById("cold-start-panel")
	if (!panel) {
		panel = document.createElement("div")
		panel.id = "cold-start-panel"
		panel.className = "telemetry-panel cold-start"
		telemetry.insertAdjacentElement("afterbegin", panel)
	}

	// Build the panel structure safely (avoiding innerHTML with untrusted text).
	const eyebrow = document.createElement("div")
	eyebrow.className = "telemetry-eyebrow"
	eyebrow.textContent = "COLD START"

	const gaugeContainer = document.createElement("div")
	gaugeContainer.className = "gauge-container"
	const gaugeBar = document.createElement("div")
	gaugeBar.className = "gauge-bar"
	const gaugeFill = document.createElement("div")
	gaugeFill.className = "gauge-fill"
	gaugeFill.style.width = `${progress * 100}%`
	gaugeFill.style.background = thermalColor(progress)
	gaugeBar.appendChild(gaugeFill)
	gaugeContainer.appendChild(gaugeBar)

	const progressText = document.createElement("div")
	progressText.className = "telemetry-subtext"
	progressText.textContent = `downloading weights · ${Math.round(progress * 100)}%`

	const statusText = document.createElement("div")
	statusText.className = "telemetry-subtext"
	statusText.style.fontSize = "11px"
	statusText.style.color = "var(--muted)"
	statusText.textContent = text || ""

	panel.innerHTML = ""
	panel.appendChild(eyebrow)
	panel.appendChild(gaugeContainer)
	panel.appendChild(progressText)
	panel.appendChild(statusText)
}

/**
 * Hide the cold-start panel.
 */
export function hideColdStartPanel() {
	const panel = document.getElementById("cold-start-panel")
	if (panel) {
		panel.remove()
	}
}

/**
 * Begin a new assistant turn: create and return a message handle.
 * @returns {string} a unique identifier for this message's DOM node
 */
export function beginAssistantTurn() {
	const conversation = document.getElementById("conversation")
	if (!conversation) return null

	const messageId = `message-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
	const messageEl = document.createElement("div")
	messageEl.id = messageId
	messageEl.className = "message assistant"
	messageEl.innerHTML = '<div class="message-content"></div>'

	conversation.appendChild(messageEl)
	conversation.scrollTop = conversation.scrollHeight

	return messageId
}

/**
 * Append a thought delta to a message.
 *
 * Self-revealing: the collapsed `<details>` region is created on the first delta
 * and shown by CSS, so callers do not have to reveal it separately.
 *
 * @param {string} turnHandle - message ID from beginAssistantTurn()
 * @param {string} delta - thought text
 */
export function appendThoughtDelta(turnHandle, delta) {
	const messageEl = document.getElementById(turnHandle)
	if (!messageEl) return

	let thoughtEl = messageEl.querySelector(".message-thought")
	if (!thoughtEl) {
		thoughtEl = document.createElement("details")
		thoughtEl.className = "message-thought"
		thoughtEl.open = false // Collapsed by default; the user can toggle it open.
		thoughtEl.innerHTML = `
      <summary>Thought</summary>
      <div class="message-thought-content"></div>
      <div class="message-divider"></div>
    `
		messageEl.insertAdjacentElement("afterbegin", thoughtEl)
	}

	const contentEl = thoughtEl.querySelector(".message-thought-content")
	if (contentEl) {
		contentEl.textContent += delta
	}

	// Auto-scroll to bottom.
	const conversation = document.getElementById("conversation")
	if (conversation) {
		conversation.scrollTop = conversation.scrollHeight
	}
}

/**
 * Append an answer delta to a message.
 * @param {string} turnHandle - message ID from beginAssistantTurn()
 * @param {string} delta - answer text
 */
export function appendAnswerDelta(turnHandle, delta) {
	const messageEl = document.getElementById(turnHandle)
	if (!messageEl) return

	let answerEl = messageEl.querySelector(".message-answer")
	if (!answerEl) {
		answerEl = document.createElement("div")
		answerEl.className = "message-answer"
		messageEl.appendChild(answerEl)
	}

	answerEl.textContent += delta

	// Auto-scroll to bottom.
	const conversation = document.getElementById("conversation")
	if (conversation) {
		conversation.scrollTop = conversation.scrollHeight
	}
}

/**
 * Append a user message to the conversation.
 * @param {string} text - message text
 */
export function appendUserMessage(text) {
	const conversation = document.getElementById("conversation")
	if (!conversation) return

	const messageEl = document.createElement("div")
	messageEl.className = "message user"
	messageEl.innerHTML = `<div class="message-answer">${escapeHtml(text)}</div>`

	conversation.appendChild(messageEl)
	conversation.scrollTop = conversation.scrollHeight
}

/**
 * Update the telemetry panel with live stats.
 * @param {Object} stats
 * @param {string} stats.prefillTps - formatted prefill tokens/s
 * @param {string} stats.decodeTps - formatted decode tokens/s
 * @param {string} stats.ttft - formatted time-to-first-token
 * @param {string} stats.inputTokens - formatted input token count
 * @param {string} stats.outputTokens - formatted output token count
 * @param {number | undefined} stats.contextWindow - max context size
 * @param {number | undefined} stats.contextUsagePercent - context usage %
 * @param {string} stats.decodeColor - CSS color for decode gauge
 * @param {number} stats.decodeRatio - 0..1 decode thermal ratio
 */
export function updateTelemetry(stats) {
	const telemetry = statsRegion()
	if (!telemetry) return

	// Remove the cold-start panel if it exists.
	const coldStartPanel = document.getElementById("cold-start-panel")
	if (coldStartPanel) {
		coldStartPanel.remove()
	}

	// Build the telemetry panels.
	let html = ""

	// Decode tok/s panel with thermal gauge.
	html += `
    <div class="telemetry-panel">
      <div class="telemetry-eyebrow">Decode</div>
      <div class="telemetry-value">${stats.decodeTps || "—"}</div>
      <div class="gauge-container">
        <div class="gauge-bar">
          <div class="gauge-fill" style="width: ${stats.decodeRatio * 100}%; background: ${stats.decodeColor};"></div>
        </div>
      </div>
    </div>
  `

	// Prefill tok/s panel.
	html += `
    <div class="telemetry-panel">
      <div class="telemetry-eyebrow">Prefill</div>
      <div class="telemetry-value">${stats.prefillTps || "—"}</div>
    </div>
  `

	// Time-to-first-token panel.
	html += `
    <div class="telemetry-panel">
      <div class="telemetry-eyebrow">TTFT</div>
      <div class="telemetry-value">${stats.ttft || "—"}</div>
    </div>
  `

	// Tokens panel.
	html += `
    <div class="telemetry-panel">
      <div class="telemetry-eyebrow">Tokens</div>
      <div class="telemetry-subtext">in: ${stats.inputTokens}</div>
      <div class="telemetry-subtext">out: ${stats.outputTokens}</div>
    </div>
  `

	// Context usage panel (if available).
	if (stats.contextWindow && stats.contextUsagePercent !== undefined) {
		const bars = Math.round(stats.contextUsagePercent / 10)
		const emptyBars = 10 - bars
		const contextBar = "▓".repeat(Math.max(0, bars)) + "░".repeat(Math.max(0, emptyBars))

		html += `
      <div class="telemetry-panel">
        <div class="telemetry-eyebrow">Context</div>
        <div class="context-bar">${contextBar} ${stats.contextUsagePercent}%</div>
        <div class="telemetry-subtext" style="font-size: 11px;">max: ${formatTokens(stats.contextWindow)} tokens</div>
      </div>
    `
	}

	telemetry.innerHTML = html
}

/**
 * Set the composer state (idle or generating).
 * @param {string} state - "idle" or "generating"
 */
export function setComposerState(state) {
	const input = document.getElementById("composer-input")
	const button = document.getElementById("composer-send")

	if (state === "generating") {
		if (input) input.disabled = true
		if (button) {
			button.dataset.state = "stop"
			button.textContent = "Stop"
		}
	} else {
		if (input) input.disabled = false
		if (button) {
			button.dataset.state = "send"
			button.textContent = "Send"
		}
	}
}

/**
 * Clear the empty-state message when the first turn begins.
 */
export function clearEmptyState() {
	const emptyState = document.getElementById("empty-state")
	if (emptyState) {
		emptyState.remove()
	}
}

/**
 * Escape HTML special characters to prevent XSS.
 * @param {string} text
 * @returns {string}
 */
function escapeHtml(text) {
	const div = document.createElement("div")
	div.textContent = text
	return div.innerHTML
}

/* ─── MCP servers panel ───────────────────────────────────────────────────
 *
 * Everything below renders with `createElement` + `textContent`, never
 * innerHTML. That is not stylistic here: tool names, tool descriptions, and
 * error messages all originate from a remote MCP server the user just pasted
 * a URL for. They are untrusted input on the same footing as model output.
 */

/**
 * Ids of servers whose tool list the user has expanded. A full re-render
 * replaces the `<details>` elements, which would otherwise snap shut on every
 * state change (including an unrelated server's).
 * @type {Set<string>}
 */
const expandedTools = new Set()

/** Human-readable status line per lifecycle state. */
const STATUS_LABEL = {
	connecting: "connecting…",
	connected: "connected",
	error: "failed",
	detached: "detached",
}

/**
 * Build one icon button for a server card.
 * @param {string} glyph - the button's visible character
 * @param {string} label - accessible name (also the tooltip)
 * @param {() => void} onClick
 * @returns {HTMLButtonElement}
 */
function iconButton(glyph, label, onClick) {
	const button = document.createElement("button")
	button.type = "button"
	button.className = "mcp-icon-button"
	button.textContent = glyph
	button.title = label
	button.setAttribute("aria-label", label)
	button.addEventListener("click", onClick)
	return button
}

/**
 * Render the collapsible tool list for a connected server.
 * @param {import('@lucasschirm/bhai/plugins/mcp').McpServerState} state
 * @returns {HTMLDetailsElement}
 */
function renderToolList(state) {
	const details = document.createElement("details")
	details.className = "mcp-tools"
	details.open = expandedTools.has(state.id)
	details.addEventListener("toggle", () => {
		if (details.open) expandedTools.add(state.id)
		else expandedTools.delete(state.id)
	})

	const summary = document.createElement("summary")
	summary.textContent = state.tools.length === 1 ? "1 tool" : `${state.tools.length} tools`
	details.appendChild(summary)

	const list = document.createElement("ul")
	list.className = "mcp-tool-list"
	for (const tool of state.tools) {
		const item = document.createElement("li")
		item.className = "mcp-tool"

		const name = document.createElement("code")
		name.textContent = tool.shortName
		item.appendChild(name)

		if (tool.description) {
			const description = document.createElement("span")
			description.className = "mcp-tool-description"
			description.textContent = tool.description
			item.appendChild(description)
		}

		list.appendChild(item)
	}
	details.appendChild(list)

	return details
}

/**
 * Render one server card.
 * @param {import('@lucasschirm/bhai/plugins/mcp').McpServerState} state
 * @param {McpCardHandlers} handlers
 * @returns {HTMLLIElement}
 */
function renderServerCard(state, handlers) {
	const card = document.createElement("li")
	card.className = "mcp-server"
	card.dataset.status = state.status

	const head = document.createElement("div")
	head.className = "mcp-server-head"

	const dot = document.createElement("span")
	dot.className = "status-dot"
	dot.dataset.state = state.status
	head.appendChild(dot)

	const name = document.createElement("span")
	name.className = "mcp-server-name"
	name.textContent = state.serverName
	name.title = state.config.url
	head.appendChild(name)

	const actions = document.createElement("div")
	actions.className = "mcp-actions"
	if (state.status === "connected") {
		actions.appendChild(
			iconButton("⟳", `Refresh tools for ${state.serverName}`, () => handlers.onRefresh(state.id)),
		)
	}
	if (state.status === "error") {
		actions.appendChild(
			iconButton("🐛", `Error details for ${state.serverName}`, () =>
				handlers.onShowError(state.id),
			),
		)
		actions.appendChild(
			iconButton("↻", `Retry connecting to ${state.serverName}`, () => handlers.onRetry(state.id)),
		)
	}
	actions.appendChild(
		iconButton("✕", `Remove ${state.serverName}`, () => handlers.onRemove(state.id)),
	)
	head.appendChild(actions)
	card.appendChild(head)

	const status = document.createElement("div")
	status.className = "mcp-server-status"
	const label = STATUS_LABEL[state.status] ?? state.status
	if (state.status === "connected") {
		// The tool count lives on the `<details>` summary below, so repeating it
		// here would say the same thing twice. Call out the empty case, which
		// has no summary to speak for it.
		status.textContent = state.tools.length === 0 ? `${label} · no tools` : label
	} else if (state.status === "error" && state.error) {
		// The name alone on this line; the full message is one click away in the
		// dialog. A 280px rail cannot show a stack trace usefully.
		status.textContent = `${label} · ${state.error.name}`
	} else {
		status.textContent = label
	}
	card.appendChild(status)

	if (state.status === "connected" && state.tools.length > 0) {
		card.appendChild(renderToolList(state))
	}

	return card
}

/**
 * @typedef {Object} McpCardHandlers
 * @property {(id: string) => void} onRefresh - re-poll the server's tool list
 * @property {(id: string) => void} onRetry - re-attempt a failed connection
 * @property {(id: string) => void} onRemove - detach the server
 * @property {(id: string) => void} onShowError - open the error-details dialog
 */

/**
 * Render the full list of MCP servers.
 *
 * Re-renders the whole list rather than patching it: the list is a handful of
 * items, and whole-list rendering removes an entire class of stale-node bugs.
 * The only cross-render state that matters (which tool lists are expanded) is
 * carried explicitly in {@link expandedTools}.
 *
 * @param {import('@lucasschirm/bhai/plugins/mcp').McpServerState[]} states
 * @param {McpCardHandlers} handlers
 */
export function renderMcpServers(states, handlers) {
	const list = document.getElementById("mcp-server-list")
	if (!list) return

	// Drop expansion state for servers that no longer exist, so the set does
	// not grow without bound across a long session.
	const liveIds = new Set(states.map((s) => s.id))
	for (const id of expandedTools) {
		if (!liveIds.has(id)) expandedTools.delete(id)
	}

	list.innerHTML = ""

	if (states.length === 0) {
		const empty = document.createElement("li")
		empty.className = "mcp-empty"
		empty.textContent = "No servers attached."
		list.appendChild(empty)
		return
	}

	for (const state of states) {
		list.appendChild(renderServerCard(state, handlers))
	}
}

/**
 * Open the error-details dialog for a failed server.
 *
 * Uses the native `<dialog>` `showModal()`, which brings a focus trap, an
 * inert backdrop, and Esc-to-close for free — all things a hand-rolled
 * overlay would have to reimplement and usually gets wrong.
 *
 * @param {import('@lucasschirm/bhai/plugins/mcp').McpServerError} error
 */
export function showMcpError(error) {
	const dialog = document.getElementById("mcp-error-dialog")
	if (!dialog) return

	setText("mcp-error-name", error.name)
	setText("mcp-error-url", error.url)
	setText("mcp-error-time", new Date(error.at).toLocaleTimeString())
	setText("mcp-error-message", error.message)

	const hint = errorHint(error)
	const hintEl = document.getElementById("mcp-error-hint")
	if (hintEl) {
		hintEl.textContent = hint ?? ""
		hintEl.hidden = hint === null
	}

	const stackWrap = document.getElementById("mcp-error-stack-wrap")
	if (stackWrap) {
		stackWrap.hidden = !error.stack
		setText("mcp-error-stack", error.stack ?? "")
	}

	if (typeof dialog.showModal === "function") dialog.showModal()
	else dialog.setAttribute("open", "")
}

/** Close the error-details dialog. */
export function hideMcpError() {
	const dialog = document.getElementById("mcp-error-dialog")
	if (!dialog) return
	if (typeof dialog.close === "function") dialog.close()
	else dialog.removeAttribute("open")
}

/**
 * Read the add-server form.
 * @returns {{ url: string, name: string, headersText: string }}
 */
export function getMcpFormValues() {
	return {
		url: /** @type {HTMLInputElement | null} */ (document.getElementById("mcp-url"))?.value ?? "",
		name: /** @type {HTMLInputElement | null} */ (document.getElementById("mcp-name"))?.value ?? "",
		headersText:
			/** @type {HTMLTextAreaElement | null} */ (document.getElementById("mcp-headers"))?.value ??
			"",
	}
}

/**
 * Toggle the add-server form's busy state while a connection is in flight.
 * @param {boolean} busy
 */
export function setMcpFormBusy(busy) {
	const submit = /** @type {HTMLButtonElement | null} */ (document.getElementById("mcp-add-submit"))
	if (submit) {
		submit.disabled = busy
		submit.textContent = busy ? "Connecting…" : "Connect"
	}
	for (const id of ["mcp-url", "mcp-name", "mcp-headers"]) {
		const field = /** @type {HTMLInputElement | null} */ (document.getElementById(id))
		if (field) field.disabled = busy
	}
}

/**
 * Show a validation error above the form's submit button.
 * @param {string} message
 */
export function showMcpFormError(message) {
	const el = document.getElementById("mcp-add-error")
	if (!el) return
	el.textContent = message
	el.hidden = false
}

/** Clear the add-server form's validation error. */
export function clearMcpFormError() {
	const el = document.getElementById("mcp-add-error")
	if (!el) return
	el.textContent = ""
	el.hidden = true
}

/** Clear the add-server form's fields and collapse it. */
export function resetMcpForm() {
	const form = /** @type {HTMLFormElement | null} */ (document.getElementById("mcp-add-form"))
	if (form) form.reset()
	clearMcpFormError()
	const details = /** @type {HTMLDetailsElement | null} */ (document.getElementById("mcp-add"))
	if (details) details.open = false
}

/**
 * Set an element's text content by id, ignoring a missing element.
 * @param {string} id
 * @param {string} text
 */
function setText(id, text) {
	const el = document.getElementById(id)
	if (el) el.textContent = text
}
