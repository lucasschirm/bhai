/**
 * @file bhai WebLLM example · DOM helpers
 *
 * Exports plain functions for DOM querying, rendering, and updates.
 * All direct DOM manipulation lives here; main.js calls these functions
 * for orchestration and never touches the DOM directly.
 */

import { formatSeconds, formatTokens, formatTps } from "./lib/format.js"
import { thermalColor } from "./lib/thermal.js"

/**
 * Display a fatal error message that blocks further interaction.
 * @param {string} message - error description
 */
export function showFatalError(message) {
	const telemetry = document.getElementById("telemetry")
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
	const telemetry = document.getElementById("telemetry")
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
 * Reveal the thought region once content exists for this turn.
 * @param {string} turnHandle - message ID from beginAssistantTurn()
 */
export function revealThoughtRegion(turnHandle) {
	const messageEl = document.getElementById(turnHandle)
	if (!messageEl) return

	const thoughtEl = messageEl.querySelector(".message-thought")
	if (thoughtEl) {
		thoughtEl.style.display = "block"
		thoughtEl.open = false // Allow user to toggle, default closed
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
	const telemetry = document.getElementById("telemetry")
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
