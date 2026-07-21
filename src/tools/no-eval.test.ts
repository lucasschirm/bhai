/** @file No-eval regression test — ensures kernel never dynamically evaluates model output.
 *
 * SECURITY: § 13 — "Model output and tool results are untrusted data."
 * The kernel never evals, executes, or dynamically compiles model output.
 *
 * This test uses a static code scan to catch any future introduction of
 * eval(), new Function(), or similar code-execution patterns in the non-test
 * source tree. Dynamic code evaluation would be a security regression, so this
 * test fails the suite if it ever appears outside of test fixtures.
 */

import { readFileSync, readdirSync } from "node:fs"
import { join, resolve } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * Recursively scan a directory for TypeScript files, excluding test files.
 */
function* scanTypeScriptFiles(dir: string): Generator<string> {
	const entries = readdirSync(dir, { withFileTypes: true })
	for (const entry of entries) {
		const fullPath = join(dir, entry.name)
		if (entry.isDirectory()) {
			// Skip node_modules and dist
			if (entry.name !== "node_modules" && entry.name !== "dist") {
				yield* scanTypeScriptFiles(fullPath)
			}
		} else if (
			entry.isFile() &&
			entry.name.endsWith(".ts") &&
			!entry.name.endsWith(".test.ts") &&
			!entry.name.endsWith(".spec.ts")
		) {
			yield fullPath
		}
	}
}

describe("Security: No dynamic code evaluation", () => {
	it("eval() should not appear in src/** (non-test files)", () => {
		const srcDir = resolve("src")
		const matches: string[] = []

		for (const filePath of scanTypeScriptFiles(srcDir)) {
			const content = readFileSync(filePath, "utf-8")
			if (content.includes("eval(")) {
				matches.push(filePath)
			}
		}

		expect(matches, `Found eval() in non-test files: ${matches.join(", ")}`).toEqual([])
	})

	it("new Function should not appear in src/** (non-test files)", () => {
		const srcDir = resolve("src")
		const matches: string[] = []

		for (const filePath of scanTypeScriptFiles(srcDir)) {
			const content = readFileSync(filePath, "utf-8")
			if (content.includes("new Function")) {
				matches.push(filePath)
			}
		}

		expect(matches, `Found new Function() in non-test files: ${matches.join(", ")}`).toEqual([])
	})

	it("setTimeout/setInterval with string should not appear in src/**", () => {
		const srcDir = resolve("src")
		const matches: string[] = []

		for (const filePath of scanTypeScriptFiles(srcDir)) {
			const content = readFileSync(filePath, "utf-8")
			// Look for setTimeout/setInterval with quoted strings as first arg
			// This is a heuristic: setTimeout("code", ...) or setInterval('code', ...)
			if (/setTimeout\s*\(\s*["']/.test(content) || /setInterval\s*\(\s*["']/.test(content)) {
				matches.push(filePath)
			}
		}

		expect(
			matches,
			`Found setTimeout/setInterval with string callback in non-test files: ${matches.join(", ")}`,
		).toEqual([])
	})
})
