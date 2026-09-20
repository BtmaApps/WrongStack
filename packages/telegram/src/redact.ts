/**
 * Secret redaction for outbound Telegram messages.
 *
 * The implementation lives in `@wrongstack/primitives`
 * (`packages/primitives/src/redact-command.ts`), using the OUTBOUND profile.
 * Read that module before changing any pattern: it documents why this surface
 * deliberately does NOT match glued short flags (`-target`, `-tries`,
 * `-timeout` are everyday outbound text) and why an unseparable match is wiped
 * entirely instead of keeping the flag name.
 *
 * This module used to be a dependency-free hand-mirrored copy of `redactCommand`
 * ("Mirrors `redactCommand` from `@wrongstack/tools` without taking a dependency
 * on the tools package"). The Telegram notification path forwards tool output
 * verbatim to a phone, i.e. it is the highest-risk exfiltration surface, and the
 * manual mirror drifted out of sync with the canonical pattern set — which is
 * exactly why it now shares the one implementation instead of copying it.
 */
export { redactSecrets } from '@wrongstack/primitives';
