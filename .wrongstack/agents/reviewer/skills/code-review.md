## SSE AbortController supersession [applied 18×, 18 ok]

- Before approving or flagging `close()` guards in `packages/mcp/src/transport-sse.ts`, verify whether `close()` aborts without replacing `this.abortController`; this can keep `this.abortController === controller` valid after close.
- Require stale `readSSEBody` finally paths and SSE callbacks to skip `streamSignal`, `rejectStreamPending`, and state transitions whenever the identity check fails, so they do not clobber a newer connection. If all invariants hold, return exactly `{"findings": []}`.

## MCP constants, logging, and error reachability [applied 11×, 11 ok]

- If a diff replaces `500 * 2 ** attempt` with `MCP_CONSTANTS.RECONNECT.BACKOFF_MULTIPLIER`, read the live literal in `packages/mcp/src/constants.ts` before classifying it; only identical values are a behavior-preserving refactor, otherwise flag a timing regression.
- Before flagging a suppressed `log.warn`, check whether `assertSupportedServerProtocolVersion` already emits a structured warn and whether the original `err` still reaches higher-level logging; do not report evidence loss when both signals survive.
- For `err instanceof SomeErrorClass`, grep every throw site and confirm each throw sits inside the reviewed `try` around `client.connect()` and class identity survives intermediate wrappers; treat an unreachable instance check as inert.

## Teardown tracking and default-on gates [applied 9×, 9 ok]

- For `trackAudit`/`boundAuditWait` in `packages/cli/src/wiring/dep-watcher.ts`, verify load-bearing behavior, not comments: each tracked promise must be a never-rejecting `then(_,_)` completion so `Promise.race` cannot reject into `waitUntil`; the bound timer must be `unref()`; sibling-API tracking promises must be called without `await` inside the spawn `try`.
- For a `cfg?.['enabled'] === true` → `!== false` default-on flip, confirm the producer returns the raw fragment, not `undefined`, when disabled; every newly reachable `cfg['key']` read gained optional chaining; and sibling `packages/cli/src/wiring/dep-watcher-bridge.ts` flips identically. If these hold, return exactly `{"findings": []}`.

## Sandbox fail-closed asymmetry [applied 3×, 3 ok]

- Treat pass conditions using `mode === 'off'` against exec wrapper `mode !== 'enforced'` as intentional fail-closed hardening only after checking `SandboxMode` in `packages/core/src/sandbox/types.ts` and pinning tests in `packages/core/tests/sandbox/mcp-gate.test.ts`; return exactly `{"findings": []}` when the tests support the asymmetry.
