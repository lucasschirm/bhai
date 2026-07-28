/** @file The weight-download progress panel shown on a model's first load. */

import { el } from "../lib/dom.js"
import { thermalColor } from "../lib/thermal.js"

/** Controller returned by {@link createColdStartPanel}. */
export interface ColdStartPanel {
	/**
	 * Render download progress.
	 *
	 * @param progress - 0..1
	 * @param text - MLC's status line, e.g. "Fetching param cache 3/10"
	 */
	show(progress: number, text: string): void
	/** Remove the panel. */
	hide(): void
}

/**
 * Own the cold-start panel.
 *
 * Lives in its own host element rather than inside `#telemetry-stats`: the
 * stats region is replaced wholesale after every turn, and sharing a parent
 * with it meant the panel had to be defensively re-created on each update.
 *
 * @param host - The container this panel is rendered into
 */
export function createColdStartPanel(host: HTMLElement): ColdStartPanel {
	return {
		show(progress, text) {
			const fill = el("div", {
				className: "gauge-fill",
				style: { width: `${progress * 100}%`, background: thermalColor(progress) },
			})

			host.replaceChildren(
				el("div", {
					className: "telemetry-panel cold-start",
					attrs: { id: "cold-start-panel" },
					children: [
						el("div", { className: "telemetry-eyebrow", text: "COLD START" }),
						el("div", {
							className: "gauge-container",
							children: [el("div", { className: "gauge-bar", children: [fill] })],
						}),
						el("div", {
							className: "telemetry-subtext",
							text: `downloading weights · ${Math.round(progress * 100)}%`,
						}),
						el("div", {
							className: "telemetry-subtext cold-start-status",
							text: text || "",
						}),
					],
				}),
			)
		},

		hide() {
			host.replaceChildren()
		},
	}
}
