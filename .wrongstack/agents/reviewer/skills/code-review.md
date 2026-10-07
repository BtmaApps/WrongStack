## SSE supersession

- In `packages/mcp/src/transport-sse.ts`, distinguish shutdown from supersession: `close()` aborts without replacing `this.abortController`, so `this.abortController === controller` can still hold after shutdown.
- Require `readSSEBody` cleanup and SSE callbacks to skip `streamSignal`, `rejectStreamPending`, and state transitions when controller identity differs; stale work must not overwrite a newer connection.

## MCP constants and diagnostics

- For `500 * 2 ** attempt` → `MCP_CONSTANTS.RECONNECT.BACKOFF_MULTIPLIER`, compare the live literal in `packages/mcp/src/constants.ts` with the removed multiplier before declaring behavior preserved.
- Before flagging suppressed `log.warn`, inspect `assertSupportedServerProtocolVersion` for its structured warning and trace whether the original `err` reaches higher-level logging; report evidence loss only if absent.
- For `err instanceof SomeErrorClass`, inspect every throw site for reachability within the `try` around `client.connect()` and verify class identity survives wrappers; unreachable gates are inert.

## Teardown and default-on gates

- For `trackAudit`/`boundAuditWait` in `packages/cli/src/wiring/dep-watcher.ts`, require tracked promises to use never-rejecting `then(_,_)` completions, preventing `Promise.race` rejection into `waitUntil`; require the bound timer’s `unref()`. Keep sibling tracking calls unawaited inside the spawn `try`, lest tracking rejection discard a successful spawn.
- For `cfg?.['enabled'] === true` → `!== false`, verify the producer preserves the raw disabled fragment, newly reachable `cfg['key']` reads use optional chaining, and the sibling gate in `packages/cli/src/wiring/dep-watcher-bridge.ts` changes consistently.

## Local preferences

- When adding a required nested-interface field in `packages/webui-hq/src/data/local-prefs.ts`, inspect `DEFAULT_PREFS` and `mergeWithDefaults`: require the annotated default literal to include it to avoid TS2741, and require explicit per-field type validation so persisted values survive normalization.

## Sandbox and output

- Treat `mode === 'off'`, denying all other values, as intentional fail-closed behavior rather than automatically conflicting with the exec wrapper’s `mode !== 'enforced'`; consult `SandboxMode` in `packages/core/src/sandbox/types.ts` and pinning tests in `packages/core/tests/sandbox/mcp-gate.test.ts`.
- When these targeted invariants hold and no finding remains, return exactly `{"findings": []}`.
