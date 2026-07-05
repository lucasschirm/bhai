// Core kernel barrel — populated by later tasks (kernel types, BHAI class,
// Conversation, event bus, decorators; see ARCHITECTURE.md §§ 6-11).
//
// ENVIRONMENT BOUNDARY (§ 5): files under src/core/** depend only on web-standard
// APIs (fetch, AbortController, ReadableStream/async iterables, crypto.randomUUID,
// structuredClone). No Node built-ins, no DOM, no imports from src/plugins/**.
export {}
