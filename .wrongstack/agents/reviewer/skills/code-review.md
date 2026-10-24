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

- Always resolve the reviewed surface against the file on disk before judging a call-site contract — the diff bundle is a snapshot and can lag the working tree (here `attemptReconnectHelper` in `packages/webui/src/lib/ws-client-connection.ts` changed from host fields to a `{ shouldReconnect: () => boolean }` config object between the diff snapshot and disk, changing what the caller must pass). (anchors: `attemptReconnectHelper`, `packages/webui/src/lib/ws-client-connection.ts`, `{ shouldReconnect: () => boolean }`) [applied 1×, 1 ok]
- When a review bundle retargets test imports from `@wrongstack/core/agent-catalog` to `@wrongstack/agent-catalog` (or deep `../../../agent-catalog/src/...` paths) during the core-extraction refactor, prove the target exists with a `glob` over `packages/agent-catalog/src/**` before issuing an all-clear. (anchors: `@wrongstack/core/agent-catalog`, `@wrongstack/agent-catalog`, `../../../agent-catalog/src/...`, `glob`, `packages/agent-catalog/src/**`, `@wrongstack/core`) [applied 1×, 1 ok]
- When reviewing a module-extraction refactor, verify the extracted sibling's back-reference to the source module is `import type` (erased at compile time), not a runtime import — a runtime back-import (as in `packages/vibeui/src/lib/session-agents.ts` importing `SessionState` from `session.ts`) would create a true module cycle that breaks ESM initialization order even though TypeScript compiles cleanly. Also confirm every formerly module-private helper that stays in use inside the source file (e.g. `bounded`, `number` in `session.ts`) is present in the new import list, and that pre-existing imports left behind by the move (e.g. `isActiveAgent`) still have a live call site. (anchors: `import type`, `packages/vibeui/src/lib/session-agents.ts`, `SessionState`, `session.ts`, `bounded`, `number`, `isActiveAgent`)

- Always resolve a doc claim that a config clamp changed *direction or default* (e.g. `tools.perIterationOutputCapBytes` in `docs/architecture/explore-companion-subagent.md` claiming 24k lower-only → 100k either-direction) against the enforcement site on disk in the same review — when the scoped diff contains no matching code change, the enforcement may live in an also-changed sibling (`packages/cli/src/fleet/`, `packages/core/src/coordination/`), and a stale claim silently misinforms operators. Likewise, before approving host code that delegates ceilings via `applyRosterBudget(template)` (as in `packages/cli/src/fleet/host-explore-companion.ts`), read `applyRosterBudget` in `packages/core/src/coordination/fleet.ts` to confirm explicit per-agent budgets survive the merge rather than being replaced by `FLEET_ROSTER_BUDGETS` values — identical default numbers make both semantics indistinguishable to tests. (anchors: `tools.perIterationOutputCapBytes`, `docs/architecture/explore-companion-subagent.md`, `packages/cli/src/fleet/`, `packages/core/src/coordination/`, `applyRosterBudget(template)`, `packages/cli/src/fleet/host-explore-companion.ts`, `applyRosterBudget`, `packages/core/src/coordination/fleet.ts`, `FLEET_ROSTER_BUDGETS`)

---
*Distilled 2026-10-24T15:32:44.442Z · 1 new directive*
