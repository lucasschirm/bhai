# `src/types/` — shared type declarations

## Purpose & scope
Cross-cutting TypeScript type declarations shared across the kernel, plugins, and consumers (ARCHITECTURE.md §§ 9-11). **Types only — no runtime logic** lives anywhere under this directory. Every file is a collection of `export interface` / `export type` declarations plus TSDoc.

## Key files
- `index.ts` — types barrel. Re-exports every type declared in sibling files. Downstream tasks import shared types from here (or from the root package barrel, which re-exports this file).
- `content.ts` — `JSONSchema`, `ContentBlock`, `CallToolResult` (§ 9.1).
- `message.ts` — `BHAIMessage`, `ConversationStatus` (§ 11.1).
- `model.ts` — `DriverCapabilities`, `ModelInfo`, `Usage` (§§ 10.1, 10.5).
- `driver.ts` — `GenerationParams`, `DriverEvent`, `ChatRequest`, `ToolWireDefinition`, `BHAIDriver` (§ 10.1). `BHAIDriver` was added by TASK_0009 on TASK_0002's behalf — see the file-header coordination note.
- `events.ts` — `EmitResult`, `Unsubscribe` (§§ 6, 8.4).
- `tool.ts` — `BHAIToolDefinition`, `ToolInvocation`, `ToolExecute`, `ToolFilter`, `Icon`, `ToolAnnotations`, opaque `BHAIConversation` placeholder (§ 9.1). Added by TASK_0008 on TASK_0002's behalf — see the file-header coordination note.
- `types.test.ts` — pure compile-time type-assertion tests (`expectTypeOf` + `@ts-expect-error`) so `tsc --noEmit` fails if shapes drift from the spec.

## Conventions
- **No runtime logic**: if a file under `src/types/` needs to export a value, it belongs elsewhere. This is enforced by convention, not a lint rule.
- **Field names match the spec verbatim** for MCP wire-compatibility (§ 9.1: a BHAI tool definition *is* an MCP `Tool`). Do not rename or reorder optionality without a spec change.
- **Cross-task coordination**: if a later task (e.g. TASK_0008, TASK_0009) needs a type TASK_0002 didn't land, it adds the type here with a file-header note flagging the gap, rather than duplicating it locally.
- **`unknown` over `any`**: driver/tool-specific fields whose concrete shape isn't knowable at this layer use `unknown` (e.g. `DriverEvent`'s `tool-call.input`, `done.error`).

## Consumers
- `src/index.ts` re-exports `types/index.ts` first, so every type is available from the root package barrel.
- `src/core/`, `src/tools/`, and (future) `src/plugins/**` import types from `../types/index.js`.
- `src/types/types.test.ts` is a regression guard — `pnpm typecheck` runs it via `tsc --noEmit`.
