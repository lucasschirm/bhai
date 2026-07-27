// In-process tool registry — the single source of truth for every callable
// tool BHAI knows about (ARCHITECTURE.md § 9.2). Modeled as "one in-process
// MCP server": every registration path (imperative `addTool`, decorator,
// capability-object `tools:`, remote MCP attachment) converges on this one
// store, so `bh.listTools()` is semantically `tools/list` and invocation is
// semantically `tools/call`, regardless of where a tool came from.
//
// Scope of THIS file (TASK_0008): the registry (storage + registration events)
// and the pure `normalizeToolResult` helper. It does NOT call `execute()`,
// validate arguments against `inputSchema`, validate `outputSchema`, fire the
// `tool(beforeCall)`/`tool(processing)` event sequence, or implement
// serial/concurrent batching — all of that belongs to TASK_0026 (the agent
// loop's tool-invocation pipeline) and TASK_0012 (the MCP-specific subset).
//
// ENVIRONMENT BOUNDARY (§ 5): web-standard APIs only. This file touches nothing
// outside of plain TypeScript — no `fetch`, no `crypto`, no Node built-ins. It
// is runtime-agnostic.
//
// PATH NOTE: TASK_0008 specifies `bhai/src/tools/registry.ts`. Unlike the
// kernel (which the existing layout places under `src/core/`), the tools
// registry gets its own `src/tools/` directory per the task's "Where" section.
// It is imported by `src/core/bhai.ts` (kernel wiring) but is not itself part
// of the kernel directory.

import type { EventBus } from "../core/event-bus.js"
import type {
	BHAIToolDefinition,
	CallToolResult,
	JSONSchema,
	ToolExecute,
	ToolFilter,
} from "../types/index.js"

/**
 * Name-validation regex from § 9.1 line 597: 1–128 chars, `[a-zA-Z0-9_.-]`.
 * Compiled once; exported only for tests that want to assert the exact
 * pattern. The length bounds are enforced separately (see `validateToolName`)
 * so the error message can distinguish "too long" from "bad characters".
 */
export const TOOL_NAME_PATTERN = /^[a-zA-Z0-9_.-]+$/

/** Minimum tool-name length (§ 9.1: 1–128 chars). */
const TOOL_NAME_MIN_LENGTH = 1
/** Maximum tool-name length (§ 9.1: 1–128 chars). */
const TOOL_NAME_MAX_LENGTH = 128

/**
 * Validate a tool name against § 9.1's rules (1–128 chars, `[a-zA-Z0-9_.-]`).
 * Throws synchronously with a descriptive message on violation. Throws a plain
 * `Error` (not a dedicated `BHAIToolValidationError`) because TASK_0002 has not
 * landed a base error class — see TASK_0008's "Name validation" section, which
 * explicitly forbids inventing a new exported error class here.
 *
 * Thrown BEFORE any registration side effects (no partial insert, no event
 * fired) so callers that catch the error see the registry in its pre-call
 * state.
 */
function validateToolName(name: string): void {
	if (typeof name !== "string") {
		throw new Error(`bh.addTool(): tool name must be a string, got ${typeof name}`)
	}
	if (name.length < TOOL_NAME_MIN_LENGTH) {
		throw new Error(
			`bh.addTool(): tool name must be at least ${TOOL_NAME_MIN_LENGTH} character(s), got length ${name.length}`,
		)
	}
	if (name.length > TOOL_NAME_MAX_LENGTH) {
		throw new Error(
			`bh.addTool(): tool name must be at most ${TOOL_NAME_MAX_LENGTH} characters, got length ${name.length}`,
		)
	}
	if (!TOOL_NAME_PATTERN.test(name)) {
		throw new Error(
			`bh.addTool(): tool name "${name}" contains characters outside [a-zA-Z0-9_.-] (§ 9.1)`,
		)
	}
}

/**
 * Normalize a loose `execute()` return value into a spec-shaped
 * {@link CallToolResult} (§ 9.1).
 *
 * - **string** → wrapped as `{ content: [{ type: 'text', text }] }` (§ 9.1 line
 *   627: "string return values are wrapped as `{ content: [{ type: 'text',
 *   text }] }`").
 * - **CallToolResult** (an object with a `content` array) → returned unchanged,
 *   by reference (NOT deep-cloned). Further pipeline stages (TASK_0012's
 *   mismatch-to-`isError` conversion, etc.) own any further transformation.
 * - **undefined/void** → `{ content: [] }`. The spec only documents the
 *   string-wrapping case, not the void case; this is an explicit assumption
 *   (documented here and in TASK_0008): an empty array most literally represents
 *   "the tool completed and had nothing to say," whereas a single empty-string
 *   text block would render as a visible-but-blank message in chat UIs, which
 *   is misleading.
 *
 * This helper is pure, synchronous, and side-effect-free. It does NOT perform
 * argument validation, `outputSchema` validation, or error-catching around
 * `execute()` itself — those belong to the full tool-invocation pipeline in
 * TASK_0026.
 */
// biome-ignore lint/suspicious/noConfusingVoidType: § 9.1 specifies the execute() return union as `CallToolResult | string | void`; `void` is the spec's wording for "returned nothing", modeled here as the public signature even though biome prefers `undefined`.
export function normalizeToolResult(result: CallToolResult | string | void): CallToolResult {
	if (typeof result === "string") {
		return { content: [{ type: "text", text: result }] }
	}
	if (result === undefined || result === null) {
		// `null` is treated the same as `undefined` — a tool that returned nothing
		// (whether explicitly `return` with no value, an implicit fall-off-the-end,
		// or `return null`) gets an empty content array. The spec only documents
		// string-wrapping; the void case is the explicit assumption above.
		return { content: [] }
	}
	// Already a CallToolResult-shaped object (has a `content` array). Pass through
	// verbatim by reference — do not deep-clone. The check is structural: any
	// object with an Array-typed `content` is treated as a CallToolResult. A
	// stricter `Array.isArray(result.content)` guard would reject malformed
	// results from a misbehaving executor, but validating executor output is
	// TASK_0026's job, not this pure helper's.
	if (
		typeof result === "object" &&
		"content" in result &&
		Array.isArray((result as { content: unknown }).content)
	) {
		return result as CallToolResult
	}
	// Defensive fallback: a non-string, non-void, non-CallToolResult value (e.g.
	// a bare number or object the executor returned by mistake). Wrap its string
	// form as text so the result is always a valid CallToolResult. This keeps the
	// helper total; flagging such returns is TASK_0026's concern.
	return { content: [{ type: "text", text: String(result) }] }
}

/**
 * The in-process tool registry (§ 9.2). Stores {@link BHAIToolDefinition}
 * records keyed by `name` in a `Map`. Owns name validation, shadowing
 * semantics, and the `tool.registered`/`tool.removed` framework events (§ 8.1).
 *
 * The registry has no knowledge of "where a tool came from" (local plugin vs.
 * MCP) — that distinction lives entirely in the `name` prefix convention
 * (`mcp__<server>__<tool>` for remote tools, established in TASK_0011) and is
 * invisible to this registry's storage logic.
 */
export class ToolRegistry {
	/** Tools keyed by `name`; last registration wins (§ 9.1 shadowing). */
	private readonly tools: Map<string, BHAIToolDefinition> = new Map()

	/**
	 * @param bus The framework event bus, used to fire `tool.registered` /
	 *   `tool.removed` (§ 8.1). These are non-blockable framework events; the
	 *   registry dispatches them via the bus's kernel bypass (`dispatch()`),
	 *   consistent with how the kernel fires its other reserved/registry events.
	 */
	constructor(private readonly bus: EventBus) {}

	/**
	 * Add (or replace) a tool — object form (§ 6, § 9.1). Validates `def.name`,
	 * stores the definition, and fires `tool.registered` with `{ tool: def }`.
	 */
	addTool(def: BHAIToolDefinition): void
	/**
	 * Add (or replace) a tool — sugar form (§ 9.1 notes, line 632-634).
	 * `parameters` is an alias for `inputSchema`. The stored record is
	 * `{ name, description: '', inputSchema: parameters, execute }`.
	 *
	 * EXPLICIT ASSUMPTION (spec tension): the sugar form is `addTool(name,
	 * schema, fn)` — three positional args, no fourth slot for `description`.
	 * But `description` is REQUIRED on the full `BHAIToolDefinition` shape (§ 9.1
	 * line 599: `description: string;` with no `?`). The sugar form therefore
	 * defaults `description` to the empty string `''`. This is a judgment call
	 * the developer had to make because the spec's sugar form and the full
	 * shape's required field are in tension. `description` is NOT made optional
	 * on the stored type — that would violate § 9.1's MCP-wire-compatibility
	 * guarantee (a real MCP `Tool` object requires `description`).
	 */
	addTool(name: string, parameters: JSONSchema, execute: ToolExecute): void
	addTool(
		defOrName: BHAIToolDefinition | string,
		parameters?: JSONSchema,
		execute?: ToolExecute,
	): void {
		let def: BHAIToolDefinition
		if (typeof defOrName === "string") {
			// Sugar form — see the overload doc for the `description: ''` assumption.
			def = {
				name: defOrName,
				description: "",
				inputSchema: parameters as JSONSchema,
				execute: execute as ToolExecute,
			}
		} else {
			def = defOrName
		}
		this.registerInternal(def)
	}

	/**
	 * Internal single insertion point. Both public `addTool` overloads funnel
	 * through here so `tool.registered` fires exactly once per call regardless
	 * of which overload was used.
	 *
	 * SHADOWING ASSUMPTION (§ 9.1 line 597: "later registration shadows
	 * earlier"): registering a tool with a `name` that already exists in the map
	 * REPLACES the stored definition. The architecture doc does NOT specify
	 * whether this replacement should also fire `tool.removed` for the shadowed
	 * (overwritten) entry. This implementation resolves that ambiguity as
	 * follows: shadowing is NOT treated as a removal. Only `tool.registered`
	 * fires, carrying the new definition; `tool.removed` is reserved exclusively
	 * for explicit `removeTool()` calls. Rationale: conceptually the model/host
	 * still sees "a tool named X" continuously across the shadowing — nothing
	 * was removed from its perspective, only updated — whereas `tool.removed`
	 * implies the name is no longer callable at all, which isn't true here.
	 */
	private registerInternal(def: BHAIToolDefinition): void {
		validateToolName(def.name)
		// Insert/replace. `Map.set` on an existing key updates the value in place
		// (preserving insertion order); on a new key it appends. Either way the
		// new definition is the one stored.
		this.tools.set(def.name, def)
		// Fire-and-forget: `addTool` is synchronous (`void`), and `tool.registered`
		// is a non-blockable notification event. The dispatch is serialized through
		// the bus's global FIFO queue (§ 8.4 rule 2) and resolves asynchronously;
		// callers that need to observe it subscribe via `bh.on('tool.registered')`.
		void this.bus.dispatch("tool.registered", { tool: def })
	}

	/**
	 * Remove a tool by name (§ 6, § 9.1). Deletes the entry from the store if
	 * present and fires `tool.removed` with `{ tool }` where `tool` is the
	 * definition that was just removed (not just the bare name — hosts
	 * subscribing to `tool.removed` need the full definition to, e.g., update a
	 * UI list).
	 *
	 * JUDGMENT CALL: if `name` is not present in the registry, this is a silent
	 * no-op (does not throw, does not fire `tool.removed`). Removing something
	 * that was never there is not exceptional — it's idempotent cleanup,
	 * consistent with how most registry APIs behave (e.g. `Map.delete` returning
	 * `false` rather than throwing).
	 */
	removeTool(name: string): void {
		const def = this.tools.get(name)
		if (def === undefined) {
			// Idempotent no-op — see method doc.
			return
		}
		this.tools.delete(name)
		void this.bus.dispatch("tool.removed", { tool: def })
	}

	/**
	 * Snapshot of currently-registered tool definitions (§ 6, § 9.2 —
	 * semantically `tools/list`). Returns a FRESH array each call so callers
	 * cannot mutate the registry by mutating the returned array; the array's
	 * element references are the stored definitions (callers should not mutate
	 * those in place, but that is a host/plugin discipline concern, not
	 * something this method defends against by cloning every definition).
	 *
	 * FILTER SCOPE: the `filter?: ToolFilter` parameter's full filtering
	 * semantics (allow-list, deny-list, tag filters, driver-capability gating,
	 * and the § 9.5 3-step resolution order) are owned by TASK_0017's
	 * `resolveAvailableTools`, which is the function real callers (the future
	 * agent loop, TASK_0026) will actually use for per-turn filtering. This
	 * method implements only a minimal subset for signature compatibility:
	 *   - no filter → return everything;
	 *   - `allow` → keep only names in the allow-list;
	 *   - `deny` → drop names in the deny-list;
	 *   - `tags` → keep only tools tagged with at least one of the listed tags;
	 *   - `excludeTags` → drop tools tagged with any of the listed tags.
	 * Tag-based filtering here is a trivial AND over the tool's `tags?` array;
	 * TASK_0017's `resolveAvailableTools` is the authoritative implementation of
	 * § 9.5 and may layer additional semantics (driver-capability gating,
	 * conversation-level overrides). Do NOT reimplement the § 9.5 3-step order
	 * here.
	 */
	listTools(filter?: ToolFilter): BHAIToolDefinition[] {
		const all = Array.from(this.tools.values())
		if (!filter) {
			return all
		}
		const allow = filter.allow ? new Set(filter.allow) : undefined
		const deny = filter.deny ? new Set(filter.deny) : undefined
		const tags = filter.tags ? new Set(filter.tags) : undefined
		const excludeTags = filter.excludeTags ? new Set(filter.excludeTags) : undefined
		return all.filter((def) => {
			if (allow !== undefined && !allow.has(def.name)) return false
			if (deny?.has(def.name)) return false
			if (tags !== undefined) {
				const defTags = def.tags ?? []
				if (!defTags.some((t) => tags.has(t))) return false
			}
			if (excludeTags !== undefined) {
				const defTags = def.tags ?? []
				if (defTags.some((t) => excludeTags.has(t))) return false
			}
			return true
		})
	}

	/**
	 * Look up a single tool definition by name, or `undefined` if not registered.
	 * Convenience accessor for the agent loop (TASK_0026) and MCP re-export
	 * (TASK_0016); not part of § 6's named kernel API but a minor superset
	 * addition consistent with how `listTools()` exposes stored records.
	 */
	get(name: string): BHAIToolDefinition | undefined {
		return this.tools.get(name)
	}

	/**
	 * Number of currently-registered tools. Convenience accessor; not part of
	 * § 6's named kernel API.
	 */
	get size(): number {
		return this.tools.size
	}

	/**
	 * Satisfy the {@link ToolRegistrar} seam (TASK_0007) so `bh.toolRegistrar`
	 * can delegate to this registry without `decorators.ts` needing to change.
	 * Maps the decorator's `{ name, schema, execute }` shape onto the sugar-form
	 * `addTool(name, schema, execute)`, which defaults `description` to `''` per
	 * the sugar-form assumption documented on the public overload.
	 */
	register(toolDef: {
		name: string
		schema: JSONSchema
		execute: (...args: unknown[]) => unknown
	}): void {
		// The decorator's `execute` is loosely typed (`(...args: unknown[]) =>
		// unknown`); cast to `ToolExecute` since the registry only stores it and
		// never invokes it. The agent loop (TASK_0026) is responsible for
		// invoking `execute` with a properly-typed `ToolInvocation`.
		this.addTool(toolDef.name, toolDef.schema, toolDef.execute as ToolExecute)
	}
}
