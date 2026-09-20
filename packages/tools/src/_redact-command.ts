/**
 * Display-safe command redaction for the process registry.
 *
 * The implementation lives in `@wrongstack/primitives`
 * (`packages/primitives/src/redact-command.ts`) — read that module for the
 * separator rule, the two redaction profiles, and the leak history that
 * motivated collapsing the three hand-mirrored copies.
 *
 * This path is kept because it is the import surface of `process-registry.ts`
 * and, through it, bash/exec/pwsh/outdated/`_spawn-stream`. Redacted output
 * reaches `/ps`, crash dumps and telemetry.
 */
export { redactCommand } from '@wrongstack/primitives';
