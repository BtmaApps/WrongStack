## Live-tree contracts and refactors

- When imports move from `@wrongstack/core/agent-catalog` to `@wrongstack/agent-catalog` or deep `../../../agent-catalog/src/...` paths during core extraction, prove the target exists with `glob` over `packages/agent-catalog/src/**` before clearing the change.
- Judge call-site contracts from disk, not a possibly stale diff: re-check `attemptReconnectHelper` in `packages/webui/src/lib/ws-client-connection.ts` for `{ shouldReconnect: () => boolean }`.
- During module extraction, require `import type` for `SessionState` from `session.ts` in `packages/vibeui/src/lib/session-agents.ts`, not a runtime import; ensure retained helpers `bounded` and `number` remain imported for use in `session.ts`, and leftover `isActiveAgent` still has a live call site.

## Fleet budgets and documentation

- Before approving `applyRosterBudget(template)` in `packages/cli/src/fleet/host-explore-companion.ts`, read `applyRosterBudget` in `packages/core/src/coordination/fleet.ts` and require explicit per-agent budgets to survive the merge rather than be replaced by `FLEET_ROSTER_BUDGETS`; equal defaults do not prove equal semantics.

## SSE and MCP

- In `packages/mcp/src/transport-sse.ts`, distinguish shutdown from supersession: `close()` aborts without replacing `this.abortController`, so `this.abortController === controller` can still hold. Make `readSSEBody` cleanup and SSE callbacks avoid `streamSignal`, `rejectStreamPending`, and state transitions when controller identity differs.
- When replacing `500 * 2 ** attempt` with `MCP_CONSTANTS.RECONNECT.BACKOFF_MULTIPLIER`, compare the live constant in `packages/mcp/src/constants.ts` with the removed literal before calling behavior preserved.
- Before flagging suppressed `log.warn`, inspect `assertSupportedServerProtocolVersion` for structured warning and trace whether `err` reaches higher-level logging; for `err instanceof SomeErrorClass`, inspect every throw site's reachability within the `try` around `client.connect()` and verify class identity survives wrappers.

## Wiring, preferences, and sandbox

- For `trackAudit`/`boundAuditWait` in `packages/cli/src/wiring/dep-watcher.ts`, require tracked promises to use never-rejecting `then(_,_)`, require the bound timer’s `unref()`, and keep sibling tracking calls unawaited inside the spawn `try` so tracking rejection cannot discard a successful spawn.
- For `cfg?.['enabled'] === true` → `!== false`, verify the producer preserves the raw disabled fragment, newly reachable `cfg['key']` reads use optional chaining, and `packages/cli/src/wiring/dep-watcher-bridge.ts` changes consistently.
- For a required nested-interface field in `packages/webui-hq/src/data/local-prefs.ts`, update `DEFAULT_PREFS` and `mergeWithDefaults` with the annotated default literal and explicit per-field validation so persisted values survive normalization.
- Treat `mode === 'off'` with all other values denied as intentional fail-closed behavior; consult `SandboxMode` in `packages/core/src/sandbox/types.ts` and `packages/core/tests/sandbox/mcp-gate.test.ts` before flagging `mode !== 'enforced'`.
