/** @file The per-turn telemetry readouts in the right-hand rail. */

import { el } from "../lib/dom.js"
import { formatTokens } from "../lib/format.js"

/** Everything the panel renders, pre-formatted by the caller. */
export interface TelemetryStats {
	/** Formatted prefill tokens/s, or an em dash. */
	prefillTps: string
	/** Formatted decode tokens/s, or an em dash. */
	decodeTps: string
	/** Formatted time-to-first-token, or an em dash. */
	ttft: string
	/** Formatted input token count. */
	inputTokens: string
	/** Formatted output token count. */
	outputTokens: string
	/** Model context window, when the driver reports one. */
	contextWindow?: number
	/** Percentage of the context window used, when it can be computed. */
	contextUsagePercent: number | null
	/** CSS color for the decode gauge fill. */
	decodeColor: string
	/** 0..1 decode thermal ratio, driving the gauge width. */
	decodeRatio: number
}

/** Controller returned by {@link createTelemetryPanel}. */
export interface TelemetryPanel {
	/** Replace the readouts with a fresh set of stats. */
	update(stats: TelemetryStats): void
	/** Replace the readouts with a single message — used for fatal errors. */
	showMessage(message: string): void
}

/**
 * Build one labelled readout panel.
 *
 * @param eyebrow - The small uppercase label
 * @param children - The panel's body
 */
function panel(eyebrow: string, children: (Node | null)[]): HTMLElement {
	return el("div", {
		className: "telemetry-panel",
		children: [el("div", { className: "telemetry-eyebrow", text: eyebrow }), ...children],
	})
}

/**
 * Own the stats region of the telemetry rail.
 *
 * Builds every node with `createElement`. The values here are locally computed
 * numbers rather than server text, so this is not a security boundary the way
 * the MCP renderers are — but the old template-string `innerHTML` was the last
 * place in the example that parsed HTML at runtime, and dropping it means the
 * rule "we never assign innerHTML" holds without exceptions to remember.
 *
 * @param root - The region this panel replaces the contents of
 */
export function createTelemetryPanel(root: HTMLElement): TelemetryPanel {
	return {
		update(stats) {
			const panels: HTMLElement[] = [
				panel("Decode", [
					el("div", { className: "telemetry-value", text: stats.decodeTps || "—" }),
					el("div", {
						className: "gauge-container",
						children: [
							el("div", {
								className: "gauge-bar",
								children: [
									el("div", {
										className: "gauge-fill",
										style: {
											width: `${stats.decodeRatio * 100}%`,
											background: stats.decodeColor,
										},
									}),
								],
							}),
						],
					}),
				]),
				panel("Prefill", [
					el("div", { className: "telemetry-value", text: stats.prefillTps || "—" }),
				]),
				panel("TTFT", [el("div", { className: "telemetry-value", text: stats.ttft || "—" })]),
				panel("Tokens", [
					el("div", { className: "telemetry-subtext", text: `in: ${stats.inputTokens}` }),
					el("div", { className: "telemetry-subtext", text: `out: ${stats.outputTokens}` }),
				]),
			]

			// Context usage is omitted rather than faked when the driver does not
			// report a window for the selected model.
			if (stats.contextWindow && stats.contextUsagePercent !== null) {
				const filled = Math.max(0, Math.min(10, Math.round(stats.contextUsagePercent / 10)))
				const bar = "▓".repeat(filled) + "░".repeat(10 - filled)
				panels.push(
					panel("Context", [
						el("div", { className: "context-bar", text: `${bar} ${stats.contextUsagePercent}%` }),
						el("div", {
							className: "telemetry-subtext telemetry-subtext-small",
							text: `max: ${formatTokens(stats.contextWindow)} tokens`,
						}),
					]),
				)
			}

			root.replaceChildren(...panels)
		},

		showMessage(message) {
			root.replaceChildren(el("div", { className: "telemetry-message", text: message }))
		},
	}
}
