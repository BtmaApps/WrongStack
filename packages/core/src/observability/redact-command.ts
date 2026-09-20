/**
 * Telemetry redaction for process command + argument vectors.
 *
 * The implementation lives in `@wrongstack/primitives`
 * (`packages/primitives/src/redact-command.ts`). It used to be a hand-mirrored
 * copy of the tools redactor with a "keep these two copies in sync" comment;
 * that manual contract drifted twice and leaked in both directions, so the
 * algorithm now has exactly one home.
 *
 * `emitProcessStarted` (observability/process-telemetry.ts) consumes
 * `redactCommandArgs`, which is why this module is kept as a stable path.
 */
export { redactCommand, redactCommandArgs } from '@wrongstack/primitives';
