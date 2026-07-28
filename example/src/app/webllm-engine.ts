/** @file WebGPU capability check and engine setup. */

import * as webllm from "@mlc-ai/web-llm"

/**
 * The prebuilt app config shipped by the installed `@mlc-ai/web-llm` package.
 * Passed into the WebLLM driver so `listModels()` and `capabilities()` work
 * before the engine is fully warmed.
 */
export const prebuiltAppConfig = webllm.prebuiltAppConfig

/**
 * Whether this browser can run WebLLM at all.
 *
 * @returns true when WebGPU is present
 */
export function hasWebGpu(): boolean {
	return Boolean(navigator.gpu)
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
