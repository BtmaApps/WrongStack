## Browser policy

- In `packages/tools/src/browser/tools.ts`, treat `browserPrivateOrigins(root)` from `./policy.js` as the merged source for project `/browser allow` origins and `WRONGSTACK_BROWSER_PRIVATE_ORIGINS`.
- Before assessing “takes effect immediately in existing sessions” in `docs/browser-automation.md`, trace whether the sibling slash command or `BrowserSessionManager` in `packages/tools/src/browser/manager.ts` refreshes `managerFor`’s per-root cached snapshot; `tools.ts` alone is insufficient.
- Accept `timeoutMs` with `managesOwnTimeout: true` for browser tools as the established multi-minute subprocess convention used by `packages/tools/src/exec.ts`, `bash.ts`, and `pwsh.ts`.

## Dependencies and exports

- For dependency removal from `package.json`, attribute surviving lockfile references by their owning importer block, never line proximity. Confirm that importer’s dependency set against the relevant package, using siblings such as select/separator/tabs. pnpm removes fully unused resolutions, while references owned by another package are legitimate.
- Treat `pnpm-workspace.yaml` `overrides:` as authoritative. Root `package.json` top-level `overrides` is inert under pnpm unless expressed as `pnpm.overrides`. Pair same-day release floors with `minimumReleaseAgeExclude` under `minimumReleaseAge`.
- Before removing an entry from `architecture/test-only-exports.json`, grep the symbol repo-wide for static imports. Dynamic access such as `linuxGuard.getBlockedKillMessage(...)` in `packages/tools/tests/bash-kill-guard-targets.test.ts` does not make the export statically imported, so allowlist removal can be required bookkeeping.
- Before crediting `treeKill` from `@wrongstack/core/utils/tree-kill`, inspect both its source export and `packages/core/package.json` `exports`; if either remains unread, identify it as remaining work rather than issuing an unqualified verdict.

## Timers and event rollouts

- Require env-configured `setTimeout`/`setInterval` durations to follow `Number.isFinite(x) && x >= min ? Math.min(x, 2_147_483_647) : DEFAULT`. Node converts larger delays to 1 ms. Compare `mailbox-project-server*.ts`, `session-catalog/project-server.ts`, `kanban/src/server/project-server.ts`, `sage/src/project-server.ts`, and `tools/src/codebase-index/project-server.ts`.
- For new `SessionEvent` literals such as `enhance_usage`, grep repo-wide and verify one writer per surface and one fold per consumer. Check `packages/core/src/types/session-events.ts`, `packages/tui/src/submit-prompt-refinement.ts`, `packages/webui-server/src/server/model-operations.ts`, `session-summary-tracker.ts`, `session-store/summary-builder.ts`, and `session-store/load-session-data.ts`; full-replay and legacy branches must be mutually exclusive.

## Output

- Return `{"findings": []}` only after these project-specific checks pass.
