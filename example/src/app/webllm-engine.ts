/** @file WebGPU capability check, model allowlist resolution, and engine setup. */

import * as webllm from "@mlc-ai/web-llm"

/**
 * Curated allowlist of models to offer. Intersected at runtime with what the
 * installed `@mlc-ai/web-llm` actually ships, so a version bump that drops a
 * model degrades to the remaining ones instead of offering a dead entry.
 */
const ALLOWLIST = [
	"Qwen3-0.6B-q4f16_1-MLC",
	"Qwen3-1.7B-q4f16_1-MLC",
	"Llama-3.2-1B-Instruct-q4f16_1-MLC",
	"Llama-3.2-3B-Instruct-q4f16_1-MLC",
	"Phi-3.5-mini-instruct-q4f16_1-MLC",
]

/** The models to show, and which one starts selected. */
export interface ModelChoice {
	/** Model ids to put in the picker. */
	modelIds: string[]
	/** The id to pre-select. */
	defaultModelId: string
}

/**
 * Whether this browser can run WebLLM at all.
 *
 * @returns true when WebGPU is present
 */
export function hasWebGpu(): boolean {
	return Boolean(navigator.gpu)
}

/**
 * Resolve the model list to offer.
 *
 * Falls back to the full installed list if none of the allowlist survives the
 * intersection, and returns an empty list only when the package ships nothing.
 */
export function resolveModels(): ModelChoice {
	const installed = webllm.prebuiltAppConfig.model_list.map((model) => model.model_id)
	const available = ALLOWLIST.filter((id) => installed.includes(id))

	if (available.length === 0 && installed.length > 0) {
		console.warn("Allowlist models not found; using all available models instead.")
	}

	const modelIds = available.length > 0 ? available : installed
	// Prefer a Qwen3 (it emits `<think>` blocks, which is what the reasoning
	// pane exists to show off); otherwise take whatever is first.
	const defaultModelId = modelIds.find((id) => id.startsWith("Qwen3")) ?? modelIds[0] ?? ""

	return { modelIds, defaultModelId }
}

/**
 * Create the MLC engine.
 *
 * The host owns the engine (the "pre-warmed" form of the WebLLM driver), which
 * is what lets the example read `runtimeStatsText()` directly for telemetry.
 *
 * @param onProgress - Cold-start download progress, 0..1 plus MLC's status line
 */
export function createEngine(
	onProgress: (progress: number, text: string) => void,
): webllm.MLCEngine {
	return new webllm.MLCEngine({
		initProgressCallback: (report) => onProgress(report.progress, report.text),
	})
}
