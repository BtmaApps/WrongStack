## Consumer Closure

- For React components, grep rendered CSS classes as well as symbols: `.workspace-notes` is selected by `packages/vibeui/tests/browser-smoke.mjs`, outside `codebase-incoming-calls`.
- Read exact exports with `codebase-skeleton` before querying callers: `packages/cli/src/vibeui-dist.ts` exports `resolveVibeUiDistDir`, not `resolveVibeuiDist`.
- For `packages/vibeui/src/lib/*`, combine per-export `codebase-incoming-calls`, module-path grep, and per-symbol repo-wide grep. Verify unexpected zeros with file-scoped grep and `packages/<pkg>/tests/<module-stem>.test.ts`; indexed callers and repo-wide searches have missed live imports and tests.
- Search type-only consumers separately. For `packages/vibeui/src/lib/use-session.ts`, grep `SessionController` (`ReturnType<typeof hook>`), `Attachment`, and `DraftRequest`; runtime callers such as `workspace.tsx:55` do not close the contract.
- For `packages/vibeui/src/lib/session.ts`, include `record`, `text`, `rows`, `contentText`, `SessionState`, `ChatEntry`, `ToolEntry`, `AgentEntry`, and `InputRequest`, not just `reduceFrame`. Read `use-session.ts` around lines 150–200 for session filtering and run-ownership post-processing before describing reducer boundaries.
- For `packages/kanban/src/server/client.ts`, grep `getKanbanServerConnection`, `closeKanbanServerConnections`, and `isKanbanServerAvailable`; path regexes miss `./client.js` and multiline barrel imports. Check `@wrongstack/kanban` subpaths `/test-support`, `/manager/lifecycle`, `/contract-graph`, and `/queue-anomalies` independently of `src/index.ts`.

## Scratch and Build Surfaces

- For `.temp_files/<round>/`, combine `tree`, repo-wide round-name grep, and path-scoped `grep`; inspect sibling `run.mjs`, `run.ps1`, and Vitest configs. Verify traversal using a known target string: `.gitignore`, root `rg`, and `codebase-*` exclusions make zero hits inconclusive. Read JSONL match context before treating filename mentions as invocations.
- Trace `apps/desktop` through `scripts/build-package.mjs` `entries`, package `"main"`, and `contextBridge.exposeInMainWorld` name `wrongstackDesktop`, not import counts.

## Test Configuration

- Compare package and root `vitest.config.ts` collection and setup before classifying failures. `packages/webui-server/vitest.config.ts` omits root `setupFiles` (`./vitest.setup.ts`, hermetic `WRONGSTACK_HOME`) and `globalSetup` (`./vitest.globalTeardown.ts`, daemon reaping); package-local `bun run test` therefore differs from root execution.
- Glob `packages/<pkg>/vitest.config.*` for stale `.js` twins; inspect package `test`, `typecheck:tests`, coverage `thresholds`, and `architecture/test-typecheck-baseline/packages-<pkg>.json` for edit gates.
