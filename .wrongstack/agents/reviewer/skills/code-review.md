## SSE AbortController supersession [applied 18×, 18 ok]

- In `packages/mcp/src/transport-sse.ts`, distinguish shutdown from supersession: `close()` aborts without replacing `this.abortController`, so `this.abortController === controller` can remain valid after `close()`.
- Require `readSSEBody` cleanup and SSE callbacks to skip `streamSignal`, `rejectStreamPending`, and state transitions whenever the identity check fails; stale work must not clobber a newer connection.

## MCP constants, logging, and reachability [applied 11×, 11 ok]

- For `500 * 2 ** attempt` → `MCP_CONSTANTS.RECONNECT.BACKOFF_MULTIPLIER`, read the live literal in `packages/mcp/src/constants.ts` and compare it with the removed multiplier before calling the change behavior-preserving; a mismatch is a timing regression.
- Before flagging a newly suppressed `log.warn`, inspect `assertSupportedServerProtocolVersion` for its structured warn and trace whether the original `err` reaches a higher-level log; flag evidence loss only when that evidence is actually absent.
- For `err instanceof SomeErrorClass`, grep every throw site and confirm it is reachable inside the `try` around `client.connect()` and that class identity survives intermediate wrappers; an unreachable `instanceof` gate is inert.

## Teardown tracking and default-on gates [applied 9×, 9 ok]

- For `trackAudit`/`boundAuditWait` in `packages/cli/src/wiring/dep-watcher.ts`, require every tracked promise to be a never-rejecting `then(_,_)` completion so `Promise.race` cannot reject into `waitUntil`; require the bound timer to be `unref()`'d, and require sibling tracking calls to remain unawaited inside the spawn `try`—`await` can turn tracking rejection into a dropped successful spawn.
- For `cfg?.['enabled'] === true` → `!== false`, verify the producer returns the raw fragment rather than `undefined` when disabled, every newly reachable `cfg['key']` read uses optional chaining, and the sibling gate in `packages/cli/src/wiring/dep-watcher-bridge.ts` makes the same change.

## Sandbox fail-closed gates [applied 3×, 3 ok]

- Treat `mode === 'off'` (denying every other value) as intentional fail-closed hardening, not automatically a bug against the exec wrapper's `mode !== 'enforced'`; check `SandboxMode` in `packages/core/src/sandbox/types.ts` and the pinning tests in `packages/core/tests/sandbox/mcp-gate.test.ts`.

When these targeted invariants hold and no finding remains, return exactly `{"findings": []}`.

- When a diff adds a required field to a nested interface, immediately read the same module's default-prefs literal and merge/normalization function (`packages/webui-hq/src/data/local-prefs.ts`: `DEFAULT_PREFS`, `mergeWithDefaults`) — an annotated literal missing the new field is an unconditional TS2741 compile break, and the merge function needs explicit per-field type validation or persisted values are silently dropped. (anchors: `packages/webui-hq/src/data/local-prefs.ts`, `DEFAULT_PREFS`, `mergeWithDefaults`)

---
*Distilled 2026-10-07T09:17:50.414Z · 1 new directive*
