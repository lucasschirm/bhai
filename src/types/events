// Event-bus type declarations (§§ 6, 8.4).
// Types only — no runtime logic. See TASK_0002 for the scope contract.

/**
 * Return type of `bh.on()` / `conversation.on()` (§ 6): a callable that
 * removes the handler from the bus.
 */
export type Unsubscribe = () => void

/**
 * Result of `bh.emit()` / `conversation.emit()` (§ 8.4 lines 483-490):
 * `{ blocked: boolean; reason?: string; patch: Partial<Payload>; handled: number }`.
 *
 * The type parameter is named `Payload` and defaults to `unknown` so
 * `EmitResult` can be used both as `EmitResult<SomeSpecificPayload>` (where the
 * payload type is statically known, e.g. via module augmentation per § 8.4.4)
 * and as a bare `EmitResult` alias where it isn't.
 */
export interface EmitResult<Payload = unknown> {
	blocked: boolean
	reason?: string
	patch: Partial<Payload>
	handled: number
}
