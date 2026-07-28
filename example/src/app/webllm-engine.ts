/** @file WebGPU capability check, model list resolution, and engine setup. */

import * as webllm from "@mlc-ai/web-llm"

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
 * Resolve every model shipped by the installed `@mlc-ai/web-llm` package.
 *
 * The default selection prefers a Qwen3 model when available because it emits
 * reasoning blocks, which the demo's Thought panel is built to surface.
 */
export function resolveModels(): ModelChoice {
	const modelIds = webllm.prebuiltAppConfig.model_list.map((model) => model.model_id)
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
