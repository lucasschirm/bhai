# src/conversation/ — Conversation Surface & System-Prompt Layering & Tool Execution & Loop Termination & Compaction (TASK_0023–0031)

## Purpose

This directory holds the `BHAIConversation` interface and its implementation (`BHAIConversationImpl`), the core object that hosts and plugins interact with to manage a conversation lifecycle, handle events, and track state.

Per ARCHITECTURE.md § 11.1, a conversation encapsulates:
- **Identity** (`id`: UUID v4)
- **Messages** (read-only view to prevent external mutation)
- **Status** (lifecycle state: idle, streaming, waiting-tool, compacting, aborted, error)
- **Metadata** (host-extension record: title, task widgets, flags)
- **Token usage** (input/output counts)
- **Event bus** (conversation-scoped, with mirroring onto the framework bus)

## Key Files

- **`conversation.ts`** — Main implementation file:
  - `BHAIConversation` interface (public API)
  - `BHAIConversationImpl` class (core implementation)
  - `CreateConversationOptions` interface (extensible)
  - `ConversationSnapshot` interface (persistence shape)
  - `ConversationEvents` interface (event types)

- **`conversation.test.ts`** — Comprehensive test suite:
  - All 8 test cases from TASK_0023's "Tests Required" section
  - Additional tests for edge cases and acceptance criteria
  - Mirroring mechanics verification (the most critical test)

- **`system-prompt.ts`** (TASK_0024) — System-prompt layering and start-event firing:
  - `computePreContextSystemPrompt(conversation)` — Read layers 1-3 prompt
  - `ensureStarted(conversation, bh, options, firstMessage)` — Idempotent start-event firing
  - `MessageInit` interface — Input shape for prepended messages
  - Implements four-layer prompt assembly per § 11.6:
    - Layer 1: Host default (`BHAI.options.systemPrompt`)
    - Layer 2: Per-conversation override (`CreateConversationOptions.systemPrompt`)
    - Layer 3: `start`-event patches (`systemPrompt`, `appendSystemPrompt`, `prepend`)
    - Layer 4: Deferred to TASK_0025 (`context`-event patches)

- **`system-prompt.test.ts`** (TASK_0024) — Test suite for system-prompt and start:
  - All 6 test cases from TASK_0024's "Tests Required" section
  - Additional tests for edge cases and accumulation semantics
  - Handler idiom verification (read-then-append for prepend accumulation)

- **`agent-loop.ts`** (TASK_0025–0026) — The unbounded agent loop:
  - `sendMessage(conversation, content, options)` — Main entry point, implements full loop
  - `addMessage(conversation, content, role, options)` — Message injection without loop
  - `effectiveContextMessages(conversation)` — Filter messages by `meta.contextIncluded`
  - Helper functions `constructMessage()` (private)
  - Implements TASK_0025: context event, driver call, delta/reasoning/tool-call buffering
  - Implements TASK_0026: unbounded loop continuation on `stopReason === 'tool-calls'`

- **`agent-loop.test.ts`** (TASK_0025) — Test suite for basic message/context/streaming:
  - message(before) blocking
  - message(before) mutations
  - context event patching for tools
  - message(waiting), message(sent) lifecycle
  - 15 test cases covering TASK_0025 acceptance criteria

- **`tool-execution.test.ts`** (TASK_0026) — Comprehensive tool execution test suite:
  - Adversarial original-call-order reordering (most critical test)
  - Serial-tool waiting for concurrent portion
  - conversation.serialTools: true forcing strict one-at-a-time execution
  - Unregistered tool names producing isError results without crashing
  - maxToolRepairs boundary test (2 self-correcting, 3rd terminal)
  - beforeCall block-prevents-execute test
  - beforeCall non-block allows-execute test
  - complete handler result rewriting test
  - Tool input validation against JSON Schema
  - 9 test cases covering TASK_0026 acceptance criteria

- **`loop-termination.test.ts`** (TASK_0027) — Comprehensive loop termination & guardrails test suite:
  - Natural stop (zero tool calls) on first iteration
  - Universal terminate hint: ALL results must carry the hint to stop
  - Terminate hint "every" requirement: one false among many does NOT terminate (both directions tested)
  - maxIterations default (8) and override (e.g., 3) honored exactly
  - turn(end) veto prevents natural stop but still bounded by maxIterations
  - conversation.abort() mid-tool-call drives to error state + fires abort event
  - Per-turn timeout scope (does NOT flip conversation.status to 'aborted')
  - 8 test cases covering TASK_0027 acceptance criteria

- **`compaction.ts`** (TASK_0031) — Context-window compaction pipeline:
  - `CompactOptions` interface (reserved for future extensibility)
  - `CompactEventPayload` interface (event payload shape for all three states)
  - `runCompactionPipeline()` — Core pipeline shared by all three triggers
  - `compact()` — Manual compaction trigger (exported for delegation from `conversation.ts`)
  - Default OOB prompt and fold-selection policy (keep latest 4 messages unfolded)
  - Per-state event contract: `before` (mutable, four patch shapes), `compacting` (notification), `complete` (notification)
  - Summary message insertion at fold point with fresh UUID and system role
  - Message marking with `contextIncluded: false` for folded messages (never deleted)

- **`compaction.test.ts`** (TASK_0031) — Comprehensive compaction test suite:
  - Manual `compact()` fires `before→compacting→complete` in order
  - Summary message insertion and folding verification
  - effectiveContextMessages filtering verification (cross-check)
  - Auto-compaction threshold boundary tests (at/below/above)
  - `conversation.emit('compact', {})` interception and pipeline execution
  - Prompt modification via `{ prompt }`, `{ prependPrompt }`, `{ appendPrompt }`
  - Pre-supplied summary via `{ summary, keepFrom }` and complete-function bypass
  - Block signal `{ block: true }` with zero state change verification
  - Status='compacting' timing test (during call only)
  - Never-delete-history invariant (message count + by-id presence)
  - 9 test cases covering TASK_0031 acceptance criteria

- **`AGENTS.md`** (this file) — Documentation and agent guidance

## Core Concepts

### Event Mirroring (§ 8.1)

The most critical design in TASK_0023 is the event mirroring mechanism:

```
conversation-scoped handlers run first
        ↓
apply their patches to payload
        ↓
framework-level handlers run (seeded with patched payload)
        ↓
both stages contribute to ONE shared, continuing patch chain
```

Every conversation event (`created`, `loaded`, `message`, `meta.changed`, etc.) follows this pattern. The implementation is in `dispatchConversationEvent()` — a single method that MUST be used for all conversation event firing, never reimplemented per event.

### Stub Methods and Later Tasks

Methods stubbed in this task with `// TODO(TASK_XXXX)` are owned by later tasks:

| Method | Owner | Status | Notes |
|--------|-------|--------|-------|
| `sendMessage()` | TASK_0025 | Implemented | Agent loop, tool calling |
| `addMessage()` | TASK_0025 | Implemented | Message injection without loop |
| `setModel()` | TASK_0025/cross-group | Stub | Model switching |
| `compact()` | TASK_0031 | Implemented | Context-window compaction pipeline |
| `toJSON()` | TASK_0028 | Implemented | Full snapshot serialization + version policy |
| `abort()` | TASK_0027 | Implemented | Real cancellation propagation |
| `waitForIdle()` | TASK_0030 | Implemented | Queue-draining semantics |

### Private Implementation Details

Not part of the public interface; used by `BHAI.createConversation()` / `BHAI.loadConversation()` and TASK_0024's `system-prompt.ts`:

**From TASK_0023 (conversation lifecycle):**
- `_setResolvedModel(modelRef)` — Set the active model after resolution
- `_markLoaded()` — Mark conversation as loaded (not freshly created)
- `_fireCreated()` — Internal: fire `conversation.created` event
- `_fireLoaded(snapshot)` — Internal: fire `conversation.loaded` event

**From TASK_0024 (system-prompt and start):**
- `_isStarted()` — Check if the `start` event has already fired
- `_markStarted()` — Mark conversation as started (prevents duplicate `start` fires)
- `_getSystemPrompt()` — Read the current system prompt (layers 1-3)
- `_setSystemPrompt(value)` — Replace the system prompt (for start patches)
- `_prependMessages(messages)` — Insert messages at the top of history
- `_dispatchConversationEvent(event, payload, options?)` — Internal dispatch wrapper (uses shared mirroring)
- `_getCreateOptions()` — Retrieve the conversation's creation options

These methods use the underscore prefix and `@internal` JSDoc tag to signal they are package-private, not part of the public `BHAIConversation` interface.

## Integration Points

### With BHAI (src/core/bhai.ts)

- `BHAI.createConversation(options?)` constructs a `BHAIConversationImpl` and drives its lifecycle:
  - Fires `model.resolve` if no explicit/default model
  - Sets resolved model on the conversation
  - Fires `conversation.created` event
  - Returns the conversation

- `BHAI.loadConversation(snapshot, options?)` restores a conversation from snapshot:
  - Validates minimal snapshot shape
  - Restores `id`, `messages`, `meta`, `usage` from snapshot
  - Marks as loaded (prevents TASK_0024's `ensureStarted()` from firing `start`)
  - Fires `model.resolve` if snapshot's model is unavailable
  - Fires `conversation.loaded` event
  - Returns the conversation

### With TASK_0023's Tests

The test suite in `conversation.test.ts` verifies all acceptance criteria:
- Model resolution is triggered exactly when required (never unconditionally, never missing)
- `conversation.created` and `conversation.loaded` are mutually exclusive
- Event mirroring order and shared patch chain (the critical test)
- UUID validity and uniqueness
- Status is 'idle' after creation and loading

### With Later Tasks

- **TASK_0024** (System-Prompt & Start):
  - Adds `_systemPrompt` field storing layers 1-3 of the prompt assembly
  - Adds `_started` flag marking whether the `start` event has fired
  - Implements `ensureStarted()` to fire the `start` event exactly once
  - Collects handler patches (`systemPrompt`, `appendSystemPrompt`, `prepend`) and applies them
  - Handoff point: `computePreContextSystemPrompt()` returns the pre-context prompt for TASK_0025
  - Stores `CreateConversationOptions` for passing to `start` handlers

- **TASK_0025** (Agent Loop):
  - Calls `ensureStarted()` at the very top of `sendMessage()`'s first-run path
  - Calls `computePreContextSystemPrompt()` to get layers 1-3, passes to `context` event as starting value
  - Implements `sendMessage()`, `addMessage()`, and writes messages to `_messages`
  - Owns layer 4 (context-event patches) of the prompt assembly

- **TASK_0027** (Abort/Cancellation): Implements real `abort()` with propagation through AbortSignals

- **TASK_0028** (Snapshot Persistence): Implements `toJSON()` fully with version policy and `loadConversation()` validation

- **TASK_0030** (Wait for Idle): Implements real `waitForIdle()` with queue-draining semantics

- **TASK_0026** (Tool Execution in the Loop):
  - Restructures `sendMessage()` into an unbounded `while (true)` loop (FIX B)
  - Adds `serialTools?: boolean` and `maxToolRepairs?: number` to `CreateConversationOptions`
  - Implements `executeToolBatch()` helper with full tool-execution pipeline
  - Per-call validation (JSON Schema via ajv), beforeCall blocking, call/execute/complete|error events
  - Concurrent-by-default batching with `serial: true` opt-out per tool
  - Original-call-order result reordering (most critical correctness property)
  - Validate-and-repair with maxToolRepairs guardrail and self-correcting vs. terminal phrasings
  - Calls `resolveAvailableTools()` with driver capabilities (FIX A)
  - Adds `_getTool(name)` accessor to BHAI kernel for tool lookup
  - Implements loop continuation after tool-calls batch settles
  - Test suite verifies all acceptance criteria with adversarial timing tests

- **TASK_0030** (Steering & Concurrent Input):
  - Adds two FIFO message queues to `BHAIConversationImpl`: `_steerQueue` and `_followUpQueue`
  - Implements queue accessor methods (`_pushSteerQueue`, `_drainSteerQueue`, `_pushFollowUpQueue`, `_dequeueOneFollowUp`, `_getSteerQueueLength`, `_getFollowUpQueueLength`)
  - Exports `ConversationBusyError` class from `agent-loop.ts` for rejected immediate-delivery calls
  - Implements entry-point busy-check in `sendMessage()`: if `conversation.status !== 'idle'` and `deliverAs === 'immediate'` (default), throws `ConversationBusyError`
  - Implements steer delivery: at top of each loop iteration, drains steer queue and delivers queued messages through full `message(before)` middleware before `context` event (blocks are honored immediately)
  - Implements followUp delivery: at loop conclusion, checks followUp queue; if non-empty, dequeues ONE and starts a new `sendMessage()` recursively; only fires `idle` event when both queues are truly empty
  - Implements real `waitForIdle()`: fast path when idle + queues empty (resolves immediately); otherwise, subscribes to one-shot `idle` event (no polling)
  - New `idle` event: fires when conversation reaches `status === 'idle'` and both queues are empty; payload `{ conversation }`; never fires mid-loop or during followUp continuations
  - Added `deliverAs?: 'immediate' | 'steer' | 'followUp'` field to `SendOptions` interface (default 'immediate')
  - Added comprehensive test suite (`steering.test.ts`) with 10 test cases:
    1. Default/explicit 'immediate' delivery rejects while busy
    2. Queue accessor methods work correctly
    3. Blocked steer message not added to conversation
    4. Steer messages appear in conversation via full middleware pipeline
    5. FollowUp messages not delivered until idle
    6. waitForIdle() resolves when idle
    7. idle event fires at normal idle transition
    8. Message state tracking and blocked message handling
    9. Status transitions (idle → streaming → idle)
    10. Sequential message ordering preserved
  - Exported `ConversationBusyError` from `src/core/index.ts` (accessible via `/core` and root barrel)

- **TASK_0031** (Compaction):
  - Implements `conversation.compact()` manual trigger (fully implemented)
  - Implements auto-compaction check in agent-loop (background trigger on context-window threshold)
  - Intercepts `conversation.emit('compact', ...)` to route into the real pipeline (`source: 'emit'`)
  - Makes `bh.emit('compact', ...)` throw with clear error (conversation-scoped only)
  - Adds `compaction?: { auto: boolean; reserveTokens: number }` to `CreateConversationOptions`
  - Adds internal methods `_insertMessageAt(index, message)` and `_setMessageContextIncluded(messageId, included)`
  - Honors the `meta.contextIncluded` convention for message filtering (folded messages excluded from context)
  - Three-state event contract: `compact(before)` with four mutable patch shapes, `compact(compacting)` notification-only, `compact(complete)` notification-only
  - Never-delete-history invariant: summary message inserted, folded messages marked but retained

## Conventions

### Formatting and Style

- **Indentation**: tabs (Biome configuration)
- **Comments**: JSDoc format for all public API surface
- **Imports**: absolute paths from repo root (`../core/`, `../types/`, etc.)
- **No side effects**: Pure classes and interfaces, no module-level initialization

### Event Namespaces

Conversation-scoped custom events follow the same reserved-name rules as the framework bus:
- Reserved exact names (TASK_0004's list) cannot be emitted via `conversation.emit()`
- Un-namespaced custom names are rejected (must be `<plugin-name>.<event>`)
- The `compact` exception applies uniformly

### Type Exports

All public types are exported from both:
1. `conversation.ts` (the defining module)
2. `src/core/index.ts` (the core barrel, for `./core` subpath import)

Later tasks should import `BHAIConversation` from the appropriate barrel, never from this file directly, to maintain the packaging rules.

## What Consumes This Directory

- **`src/core/bhai.ts`** — Imports `BHAIConversationImpl` and drives creation/loading
- **`src/types/tool.ts`** — Re-exports `BHAIConversation` for tool executors' `ToolInvocation` interface
- **Tests** — Directly exercise the conversation API
- **Later tasks** (TASK_0024+) — Extend and refine conversation behavior

## Definition of Done (for agents working in this directory)

1. No duplicate event-dispatch or patch-chaining logic exists outside `EventBus.dispatch()`
2. `conversation.created` and `conversation.loaded` are mutually exclusive (never both fire for one call)
3. Mirroring order is correct: conversation handlers run first, framework mirror runs second, seeded with conversation's patches
4. All 8 test cases from TASK_0023's "Tests Required" section pass
5. `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` all exit 0
6. No `any` types; proper `Handler<Payload>` and `EmitResult<Payload>` generics used throughout
7. All public API surface has JSDoc comments with `@param`, `@returns`, `@internal` tags as appropriate
8. Stub methods throw with clear `// TODO(TASK_XXXX)` comments and error messages

## Changes Log

### TASK_0023 (Initial Implementation)
- Created conversation module with `BHAIConversation` interface and `BHAIConversationImpl` class
- Implemented event mirroring mechanism (§ 8.1)
- Implemented `BHAI.createConversation()` and `BHAI.loadConversation()`
- Added `meta`/`setMeta` with shallow-merge semantics
- Added test suite with 8 required cases plus edge cases
- Exported types from `src/core/index.ts`

### TASK_0024 (System-Prompt Layering & Start Event)
- Fixed 4 test assertions in `conversation.test.ts` (improper async error handling)
- Added `_systemPrompt` field to `BHAIConversationImpl` (layers 1-3)
- Added `_createOptions` field to store conversation creation options
- Extended constructor with `hostSystemPrompt` parameter for layer 1 (host default)
- Implemented internal accessor methods (`_isStarted`, `_markStarted`, `_getSystemPrompt`, etc.)
- Created `system-prompt.ts` module implementing the four-layer prompt assembly
- Implemented `ensureStarted()` for idempotent start-event firing with patch collection
- Implemented `computePreContextSystemPrompt()` as the TASK_0025 handoff point
- Documented the read-then-append idiom for accumulating array patches across handlers
- Added comprehensive test suite (15 test cases) covering all acceptance criteria
- Exported new public API from `src/core/index.ts`
- Updated `AGENTS.md` with TASK_0024 documentation and integration points

### TASK_0026 (Tool Execution in the Agent Loop)
- **FIX A**: Moved driver resolution BEFORE context-payload construction; called `resolveAvailableTools()` with driver capabilities for tool-calls gating (§ 9.5 step 3)
- **FIX B**: Restructured `sendMessage()` from single-pass into unbounded `while (true)` loop; added iteration counter for turn numbering; looping continues after tool-calls batch settles
- Added `serialTools?: boolean` and `maxToolRepairs?: number` to `CreateConversationOptions`
- Added `_getTool(name): BHAIToolDefinition | undefined` accessor to BHAI kernel (src/core/bhai.ts)
- Implemented `executeToolBatch()` helper function (internal to agent-loop.ts) with:
  - Per-call validation (JSON Schema via ajv)
  - beforeCall event with blockability (closes TASK_0013's seam)
  - call event and execute invocation
  - complete|error events with rewrite-patch opportunity
  - Concurrent-by-default batching with `serial: true` per-tool opt-out
  - conversation.serialTools: true global serialization opt-out
  - Original-call-order result reordering (pre-sized array, indexed by original position)
  - Validate-and-repair with maxToolRepairs guardrail (default 2 per turn)
  - Self-correcting vs. terminal phrasing distinction for repairs
  - Tool-result message appending in original order (batch settlement integration point)
- Updated constructMessage() signature to accept "tool" role
- Updated imports in agent-loop.ts to include Ajv and normalizeToolResult from registry.js
- Created `tool-execution.test.ts` with 9 comprehensive test cases:
  - Adversarial original-call-order reordering (2 concurrent + 1 serial + 1 call#2 resolves before call#1)
  - Serial-tool waiting for concurrent portion
  - conversation.serialTools: true strict one-at-a-time execution
  - Unregistered tool names producing isError (no crash)
  - maxToolRepairs boundary (2 self-correcting, 3rd terminal)
  - beforeCall block-prevents-execute (spy assertion)
  - beforeCall non-block allows-execute (spy assertion)
  - complete handler result rewriting
  - Tool input validation failure
- All tests use stateful mock drivers to handle loop continuation
- Linted and formatted to Biome standards (no noExplicitAny, organizeImports, format issues)
- Updated `AGENTS.md` with TASK_0026 documentation

### TASK_0027 (Loop Termination & Guardrails)
- **Restructured main loop**: Converted `while (true)` into a bounded, multi-termination-condition loop
- **Iteration tracking**: Added `iteration` counter (incremented at end of each turn) and `maxIterations` default 8
- **Bounded termination**: Check `iteration >= maxIterations` at top of loop; set `meta.truncatedBy = 'max-iterations'` on last assistant message (TASK_0027's unique meta-mutation exception for host bookkeeping)
- **turn(start) event**: Fire at beginning of each iteration with payload `{ turn: iteration, conversation }`
- **turn(end) event**: Fire at end of each iteration (regardless of `naturalStop`/`allTerminate`) with payload `{ turn: iteration, messages: [assistantMessage], toolResults, conversation }`
- **Turn(end) veto via continueWith**: Handlers can return `{ continueWith: string }` to inject a synthetic user message and continue (still counts toward `maxIterations`)
- **Universal terminate hint (condition b)**: After tool-batch settles, check `toolResults.every(r => r._meta?.['bhai/terminate'] === true)` (strict "every" — one false result blocks termination)
- **Abort propagation**: `conversation.abort(reason)` fires `abort` event (via internal dispatch in abort() method itself) and `conversation._getAbortSignal().aborted` check at loop top causes immediate exit
- **Tool execution abort handling**: Race `toolDef.execute()` against abort signal via `Promise.race([executePromise, abortPromise])` to force error state on mid-flight abort (defensive safeguard)
- **Per-turn timeout (turnTimeoutMs)**: If configured, race driver-event consumption against a timer; on expiry, stop consuming events (scoped to single turn, does NOT flip `conversation.status` to 'aborted')
- **Guardrails config surface**: Extended `CreateConversationOptions` with:
  - `maxIterations?: number` (default 8)
  - `turnTimeoutMs?: number` (default undefined — no timeout)
  - `retryPolicy?: RetryPolicy` (default DEFAULT_RETRY_POLICY)
- **executeToolBatch return type change**: Now returns `CallToolResult[]` (in original call order) instead of `void`, enabling turn(end) payload population
- **Abort signal propagation**: Every driver call and tool execution receives `conversation._getAbortSignal()` so single `abort()` cascades to all in-flight operations
- Created `loop-termination.test.ts` (separate from TASK_0025/0026 tests) with 8 comprehensive test cases:
  1. Natural stop (zero tool calls) ends loop on first iteration
  2. All tool results carry terminate hint => loop stops (driver NOT called again)
  3. ONE of two results has hint => loop does NOT stop (both directions of "every" tested)
  4. maxIterations default 8 is honored exactly (driver called 8 times, meta flag set)
  5. maxIterations override (e.g., 3) is honored exactly
  6. turn(end) veto prevents natural stop but still bounded by maxIterations (exactly 8 turn(end) events)
  7. conversation.abort() mid-tool-call drives that call to error state + fires abort event
  8. turnTimeoutMs timeout does NOT flip conversation.status to 'aborted' (per-turn scope)
- Updated `conversation.ts`:
  - Extended `CreateConversationOptions` with new guardrail fields (maxIterations, turnTimeoutMs, retryPolicy)
  - Updated `abort()` method to fire `abort` event via `_dispatchConversationEvent()` (using internal dispatch bypass, not restricted by emit() guard)
  - Documented per-turn timeout scope distinction from full abort
- Updated `agent-loop.ts`:
  - Added `RetryPolicy` import from retry.js
  - Restructured main sendMessage loop: bounded by maxIterations, checks abort at loop top, fires turn(start)/turn(end), checks terminate hint, handles veto
  - Finalized assistant message push and message(sent) fire for all paths (moved outside the stream-consumption loop)
  - Implemented per-turn timeout with simplified approach: set timer, check `timeoutFired` flag in event loop to break early
  - Changed executeToolBatch to return results array
  - Tool execution abort handling via Promise.race against abort signal
  - Removed async generator wrapping for timeout (simplified to flag-based approach)
- Added comprehensive JSDoc documenting:
  - maxIterations default and truncation behavior
  - turnTimeoutMs scoping (per-turn, not conversation-wide)
  - retryPolicy override semantics
  - Abort event firing location and mechanism
  - Meta-mutation exception for truncatedBy flag
  - turn(end) veto counting toward maxIterations
- All 446 tests pass (including 8 new loop-termination tests), lint clean, typecheck clean, build succeeds
- Updated `AGENTS.md` with TASK_0027 documentation and integration points

### TASK_0028 (Conversation Serialization Contract)
- **New file**: `snapshot.ts` — versioned snapshot shape, serialization/deserialization
  - `ConversationSnapshot` interface moved from `conversation.ts`, now with `v: 1` field and strict shape
  - `PlainMessage` type — message data fields only, no methods
  - `toPlainMessage(message)` — strips `append`/`setContent` methods from live messages
  - `toSnapshot(conversation)` — exports `{ v: 1, id, messages, model, params, usage, meta }`
  - `fromSnapshot(snapshot, bh, options)` — full reconstruction contract:
    - Version check: throws on `v !== 1` (explicit v1-only policy, documented as revisit-when-v2-lands)
    - Shape validation: non-empty string `id`, array `messages`, loose per-element checks
    - Reconstruction: builds new `BHAIConversationImpl`, calls `_restoreFromSnapshot()` to populate state
    - Re-attaches `append()`/`setContent()` methods (throw if called on reloaded messages, per § 11.1)
    - Marks as started via `_markStarted()` so `ensureStarted()` never fires `start`
    - Model re-resolution: fires `model.resolve` if `snapshot.model` is falsy or unregistered
    - Fires `conversation.loaded` event (never `conversation.created`)
    - Truncated-prefix support: makes NO assumptions about message completeness
- **Updated `conversation.ts`**:
  - Added `_restoreFromSnapshot(params)` method to `BHAIConversationImpl` for safe internal reconstruction
  - Updated `toJSON()` to delegate to snapshot serialization logic
  - Re-exported `ConversationSnapshot` type from `snapshot.ts` (single canonical definition)
- **Updated `bhai.ts`**:
  - Simplified `loadConversation()` to delegate to `fromSnapshot()` (removed all `as unknown as {...}` type casts)
- **Updated `core/index.ts`**:
  - Exported `PlainMessage`, `toPlainMessage`, `toSnapshot`, `fromSnapshot` for public use
  - `ConversationSnapshot` re-exported from `conversation.ts` (which re-exports from `snapshot.ts`)
- **New test file `snapshot.test.ts`** with 12 comprehensive test cases:
  1. Round-trip a scripted conversation (toJSON + loadConversation, deep-equal messages/model/usage/meta)
  2. Load truncated snapshot (slice to first message) successfully
  3. Version mismatch (v: 999) throws `/unsupported|version/i`
  4a. Unregistered model triggers model.resolve with substitute handler
  4b. Unregistered model with no handler leaves model undefined
  5. JSON round-trip proves plain-JSON-only (no functions/classes/Map/Set)
  6. Loaded conversation never fires `start` even when `ensureStarted()` is invoked
  7. Reloaded messages throw when `append()`/`setContent()` called
  8. Empty snapshot (no messages) loads successfully
  9. Preserves and restores meta and usage through round-trip
  10. Handles missing optional meta field gracefully
  11. `toPlainMessage()` strips methods while preserving data fields
  12. Invalid snapshot shapes (missing id, non-array messages, malformed messages) throw appropriate errors
- All existing tests remain passing; new tests bring total to 458+
- Linted and formatted to Biome standards (no noExplicitAny, organizeImports, format issues)
- Updated `AGENTS.md` with TASK_0028 documentation and integration points

### TASK_0030 (Steering & Concurrent Input)
- **ConversationBusyError**: New exported error class in `agent-loop.ts` for rejecting immediate-delivery calls on non-idle conversations
- **Message queues**: Added two private FIFO queues to `BHAIConversationImpl`:
  - `_steerQueue: Array<{ content, resolve, reject }>` — high-priority, delivered mid-loop
  - `_followUpQueue: Array<{ content, resolve, reject }>` — low-priority, delivered at idle boundary
- **Queue accessors** (all marked `@internal`):
  - `_pushSteerQueue(entry)` — enqueue a steer message
  - `_drainSteerQueue(): Array` — remove and return all steer entries (FIFO)
  - `_pushFollowUpQueue(entry)` — enqueue a followUp message
  - `_dequeueOneFollowUp(): entry | undefined` — remove and return first followUp entry
  - `_getSteerQueueLength(): number` — test/defensive queue length check
  - `_getFollowUpQueueLength(): number` — test/defensive queue length check
- **Entry-point busy-check** in `sendMessage()`:
  - Extract `deliverAs` from options (default 'immediate')
  - If `conversation.status !== 'idle'`:
    - If 'immediate': throw `ConversationBusyError` with descriptive message
    - If 'steer'/'followUp': return `new Promise((resolve, reject) => { push to queue })` (promise resolves later, no exception)
- **Steer delivery** — injected at TOP of loop iteration (after abort/maxIterations checks, before turn(start)):
  - Drain the steer queue (remove and return all entries)
  - For each entry (FIFO):
    - Construct message via existing `constructMessage()` helper
    - Run through full `message(before)` middleware (blockable)
    - If blocked: resolve entry's promise with blocked message (meta.blocked: true), do NOT append to history
    - If not blocked: apply patches, append to history, register entry for pending resolution
  - After this turn's assistant message is finalized (after message(sent) fires):
    - Resolve all pending steer entries with that assistant message (the "processed" point per spec)
- **FollowUp delivery** — injected at loop-conclusion (replacing unconditional loop(end) → setStatus(idle)):
  - Fire loop(end) unconditionally (every run concludes its own loop)
  - Set status to 'idle' (needed for followUp/idle dispatch to work)
  - Check if followUp queue is non-empty:
    - If yes: dequeue ONE entry, start a brand-new `sendMessage(conversation, content, { deliverAs: 'immediate' })` in the background (void/fire-and-forget, do NOT await)
    - Do NOT fire `idle` for this transition (a new run is starting)
    - Promise for that followUp entry is resolved/rejected independently by the recursive call
  - If followUp queue was empty:
    - Fire `idle` event with payload `{ conversation }` (notification-only, no patches)
    - True idle boundary reached
- **Real waitForIdle()**:
  - Fast path: if `status === 'idle' && steerQueue.length === 0 && followUpQueue.length === 0`, return `Promise.resolve()`
  - Slow path: return `new Promise((resolve) => { const unsub = bus.on("idle", () => { unsub(); resolve() }) })`
  - Event-driven, no polling
- **idle event**:
  - Fires ONLY when conversation.status becomes 'idle' AND both queues are empty
  - Payload: `{ conversation }`
  - Never fires if a followUp was queued at the would-be-idle boundary (that boundary defers to the new run's idle)
  - Exactly once in a scenario where followUp is queued at boundary: after the followUp-triggered run itself concludes with empty queues
- **Extended CreateConversationOptions** with `deliverAs?: 'immediate' | 'steer' | 'followUp'` to `SendOptions` (interface already existed, field was forward-declared by TASK_0025)
- **Updated conversation.ts**:
  - Added queue field declarations and accessor methods
  - Implemented real `waitForIdle()` per spec (replaces TASK_0023 stub)
  - Updated `CreateConversationOptions` JSDoc to document queue-related constraints (queues only on idle check, never persisted)
- **Updated agent-loop.ts**:
  - Exported `ConversationBusyError` class
  - Added entry-point busy-check logic to top of `sendMessage()`
  - Added steer delivery logic at loop iteration top (after abort/maxIterations, before turn(start))
  - Added steer resolution logic after assistant message(sent) fires
  - Restructured loop conclusion (replacing unconditional idle → loop(end) + check queues + conditional idle)
  - Added inline comments documenting spec interpretation ("processed" = after turn's assistant message sent)
- **Updated src/core/index.ts**: Exported `ConversationBusyError` for public access
- **New test file `steering.test.ts`** with 10 comprehensive test cases:
  1. default/explicit 'immediate' rejects with ConversationBusyError
  2. queue accessor methods (push, drain, dequeue, getLength)
  3. blocked steer message resolves with meta.blocked:true, not added to conversation
  4. steer messages appear in conversation via full message(before) middleware
  5. followUp messages queued and delivered after loop(end)
  6. waitForIdle() resolves immediately when already idle
  7. waitForIdle() waits for streaming to complete
  8. idle event fires at normal idle transition
  9. message state tracking verifies "before" state never advances past blockage
  10. sequential messages maintain order
- All 480 tests pass (470 prior + 10 new steering tests)
- Linted and formatted to Biome standards (no noExplicitAny, organizeImports, format issues)
- Updated `AGENTS.md` with TASK_0030 documentation, integration points, and entry requirements
