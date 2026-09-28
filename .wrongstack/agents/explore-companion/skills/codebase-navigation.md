## Symbol and importer probes

- Avoid `codebase-impact-analysis` for generic names (`Action`, `State`, `create`); use exact-specifier grep (e.g. `rg "app-action-type"`) and check re-exporting barrels such as `packages/tui/src/app-reducer.ts`.
- For common-English `hint.symbol` values (`The`, `Failed`, `Cannot`), grep the distinctive error phrase from `context` before pursuing symbol-search near-misses; investigate runtime/dependency origins when absent.
- Scope webui importer greps to `packages/webui/src` and `packages/webui/tests`; exclude `dist/` and `packages/simpleui` namesakes before validating `codebase-incoming-calls`. Check feature `index.tsx` for leaf sub-tabs, not just `view-registry.ts`.
- Verify each `packages/webui-server/src/server/` module’s exports rather than assuming `server/index.ts` exposes it; `backend-services.ts` uses deep-relative imports. If incoming-call files outnumber specifier hits, inspect binding re-exports (`import {x} from './module.js'; export {x};`) and grep exported symbols.

## Scratch scripts and disk evidence

- For `.temp_files/**/*.mjs` bare imports, directly `read` each walk-up `node_modules/<pkg>/package.json`; empty `glob` results are unreliable under `.temp_files/` and `node_modules`. Check `page.screenshot` artifacts for evidence of earlier execution, not current dependency availability; missing artifacts alone do not prove execution never completed.
- Before assessing scratch-codemod reruns, inspect generated artifacts and extraction markers in write targets. Distinguish marker-check failures before writes from clobber risks: `writeFileSync` without `'wx'` can overwrite hand-edits if markers are restored.
- Verify external snapshots by directly reading `packages/<pkg>/tests/__snapshots__/<test>.snap`, not trusting empty `glob` or `grep` results.
- When another agent edits a file, compare successive `total_lines`; re-read changed regions and cite only current on-disk anchors.

## Non-import test coupling

- Before moving or deleting leak-pin `describe` blocks, check `UNSWEPT` in `packages/tui/tests/leaked-mouse-input-sweep.test.tsx`, including ownership of `packages/tui/tests/kanban-panel-mount.test.tsx`; comment/string coupling escapes `codebase-incoming-calls`.
- Treat `packages/webui/tests/lib/session-scoped-send-stamping.test.ts` as textual lint over `packages/webui/src`; inspect `session-stamping: stamped-at-helper` and `session-stamping: deliberately-unstamped`, not incoming calls.
- Resolve `packages/webui/tests/*.mjs` smoke entry points through `packages/webui/package.json`; run `cd packages/webui && pnpm run <script>` and inspect `harnessPlugin` source strings.
- Before declaring `packages/*/tests/helpers/` dead, read header-documented consumers and validate zero-hit searches against a known positive such as `create-test-state`.
