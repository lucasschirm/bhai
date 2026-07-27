import { defineConfig } from "vitest/config"

export default defineConfig({
	test: {
		// Kernel-level tests need no DOM. Driver/plugin tests that require browser
		// globals are that driver's task's concern and override `environment` locally.
		environment: "node",
		// Tests are colocated with source under src/ as *.test.ts.
		include: ["src/**/*.test.ts"],
	},
})
