## Goal-run findings

- Re-read `packages/cli/src/goal-host.ts` before accepting stop-race claims: in `onGoalStop`, `runState = 'stopped'` and `stopped.unsubscribe()` execute before the first `await`, preventing subsequent bus events from reaching `onDone`/`onFailed`. Treat findings based on omitted or truncated regions as unverified.
- Before adding workspace guards, inspect `prepareGoalWorkspace` in `packages/core/src/goal/` and existing `await isGitWorkTree(runRoot)` gating in `packages/webui-server/src/server/goal-run.ts`.

## TUI picker and MCP contracts

- In `packages/tui/src/hooks/use-picker-keys-tools-settings.ts`, evaluate reachable counts before flagging `x + ((i + (cond ? count - 1 : 1)) % count)`: for `count ≥ 3`, `count - 1 ≡ -1 (mod count)` correctly wraps backward; reverse equals forward only at `count = 2`. Trace earlier `else if` arms consuming `remove`, and account for Ink’s Shift+Tab flags `{ tab: true, shift: true }`.
- Enforce canonical `transport` values `stdio | sse | streamable-http`. Check `packages/cli/src/boot/mcp-config-flag.ts` for rejection rules and `packages/cli/src/acp-mcp-servers.ts` for `http` → `streamable-http` normalization; do not let TUI validators persist `'http'`. Align whitelists and error messages.
- Verify TUI changes with:
  - `node node_modules/typescript/bin/tsc --noEmit --pretty false -p packages/tui/tsconfig.json`
  - `pnpm exec biome check packages/tui/src/hooks/use-panel-controllers.ts`
  - `pnpm exec vitest run packages/tui/tests/mcp-panel-management.test.tsx`

## Live-tree reconciliation

- Before fixing missing exports or undeclared identifiers in co-modified files, grep live declarations and imports and run the package typecheck. For MCP, use `node node_modules/typescript/bin/tsc --noEmit --pretty false -p packages/mcp/tsconfig.json`; read every relevant `import { … } from './constants.js'`. Attribute unrelated errors with `git status --short -- <path>`.
- After “file was modified externally,” reread the settled diff; fix residual `TS6133`, `TS2554`, or `assist/source/organizeImports` issues without recreating peer helpers.

## SQLite migrations

- Pair `SCHEMA_VERSION` bumps with guarded migrations in `packages/techstack/src/store/schema.ts`’s `applySchema`; `CREATE TABLE IF NOT EXISTS` cannot upgrade tables. Follow `ensureCatalogStorageColumns` in `packages/core/src/session-catalog/store-schema.ts`: inspect `PRAGMA table_info(<table>)` before `ALTER TABLE ... ADD COLUMN`.
- Test previous-version stores in `packages/techstack/tests/store/store-roundtrip.test.ts`; neither `sqlite.test.ts` nor fresh `:memory:` creation proves migration coverage.

- Always adjudicate `.name`-keyed error catches in `packages/cli/src` against the error class constructor and the repo's esbuild chunk-duplication hazard before flagging them as fragile — in this repo the name comparison is the hardened pattern and `instanceof` on cross-chunk workspace-imported error classes (`@wrongstack/core/*`) is the fragile variant. Anchors: `packages/cli/src/fleet/host-shadow-pass.ts` (name-keyed swallow of `FleetSpawnBudgetError`, class stamps `name` in `packages/core/src/coordination/director/director-errors.ts`), `packages/cli/src/wiring/proxy-probe.ts` (documented chunk-duplication), `packages/cli/src/goal-host.ts` (`instanceof GoalRunLeaseBusyError` — degrade-tolerant). Verify fire-and-forget containment by grepping repo-wide for the method name plus `.catch(`, and cite `packages/cli/tests/fleet/shadow-pass-unhandled.test.ts` as the regression-test pattern for unhandled-rejection probes. (anchors: `.name`, `packages/cli/src`, `instanceof`, `@wrongstack/core/*`, `packages/cli/src/fleet/host-shadow-pass.ts`, `FleetSpawnBudgetError`, `name`, `packages/core/src/coordination/director/director-errors.ts`, `packages/cli/src/wiring/proxy-probe.ts`, `packages/cli/src/goal-host.ts`, `instanceof GoalRunLeaseBusyError`, `.catch(`, `packages/cli/tests/fleet/shadow-pass-unhandled.test.ts`, `@wrongstack/core`) [applied 2×, 2 ok]
- When adding a reference counter that guards a resource lifecycle in `packages/core/src/session-catalog/registry.ts`, decrement it in a `finally` around the awaited RPC, not only on the success path — `activate_reservation` can reject with "Resume reservation expired" and a success-only decrement pins the binding so `closeBinding()` never closes its IPC client. (anchors: `packages/core/src/session-catalog/registry.ts`, `finally`, `activate_reservation`, `closeBinding()`)
- Always resolve relative write-target paths against `ctx.workingDir ?? ctx.cwd` — the base `resolvePath()` in `packages/tools/src/_util.ts` uses — when matching them against project-relative globs; `ctx.cwd` alone diverges after `set_working_dir()` and makes a path-matched tool gate fire on the wrong file. (anchors: `ctx.workingDir ?? ctx.cwd`, `resolvePath()`, `packages/tools/src/_util.ts`, `ctx.cwd`, `set_working_dir()`)
- Check `connectWithElection()` in `packages/core/src/session-catalog/client.ts` for an `explicitlyClosed` guard before adding a `close()` path that rejects the in-flight connect promise — the election loop has no closed-guard and will `spawnDetached()` a catalog daemon after `close()` returned. (anchors: `connectWithElection()`, `packages/core/src/session-catalog/client.ts`, `explicitlyClosed`, `close()`, `spawnDetached()`)

---
*Distilled 2026-10-22T17:41:21.162Z · 4 new directives*
