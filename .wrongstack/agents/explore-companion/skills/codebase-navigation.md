## Symbol probes

- Discard `codebase-impact-analysis` for generic names (`Action`, `State`, `create`) — thousands of false indirect hits; authoritative blast radius is an exact-text specifier grep (e.g. `rg "app-action-type"`) plus importers of re-exporting barrels (`packages/tui/src/app-reducer.ts`). [63× ok]
- Treat a common-English `hint.symbol` (`The`, `Failed`, `Cannot`) as first-word extraction from an error message: grep the distinctive phrase from `context` first; zero hits means runtime/dependency-emitted — report a phantom symbol and anchor recovery on the error's own hint, not `codebase-search` near-misses. [39× ok]

## Webui importer maps

- Map webui component importers with an exact-name grep scoped to `packages/webui/src` + `packages/webui/tests` — never all of `packages/webui` (`dist/` floods) — then confirm `codebase-incoming-calls` against it; `packages/simpleui` namesakes pollute the graph. Leaf sub-tabs (e.g. `TechStackView/RemediationTab.tsx`) are imported by the feature's `index.tsx`, not `view-registry.ts`. [43×, 34× ok]
- Never assume a `packages/webui-server/src/server/` module is re-exported by `server/index.ts` — verify per module with an exact-specifier grep. `backend-services.ts` is reachable only via deep relative path (`start-webui.ts` runtime, `start-webui-shutdown.ts` type-only, one test). [11× ok]
- One specifier-grep hit but more `codebase-incoming-calls` files means a sibling binding re-export (`import {x} from './module.js'; export {x};`): grep the exported symbols repo-wide and read each hit's import block (e.g. `packages/core/src/plugins/auto-review-plugin.ts:39`). [20× ok]

## Tests that aren't unit tests

- For a test sharing its basename with a production module (`sdd-wizard-ws-handler.test.ts` vs `src/server/sdd-wizard-ws-handler.ts`), grep the full `<name>.test.ts` (expect only metadata JSON like `docs/reports/architecture-health-current.json`) and the bare stem separately, classifying each `src/` hit as value vs `import type`; for prod wiring, `codebase-incoming-calls` on the imported symbol gives the non-test call site. [18×, 6× ok]
- `packages/webui/tests/lib/session-scoped-send-stamping.test.ts` is a textual lint over every `send(...)` in `packages/webui/src`: grep opt-outs `session-stamping: stamped-at-helper` (`SidePanel/SessionPanel.tsx`) and `session-stamping: deliberately-unstamped` (`lib/ws-client-domain-methods.ts`); `codebase-incoming-calls` is useless (no exports, reads via `fs`). [11× ok]
- `packages/webui/tests/*.mjs` smoke scripts are npm-script entry points, not vitest: the caller is the script name in `packages/webui/package.json` (e.g. `test:user-input-browser`); run via `cd packages/webui && pnpm run <script>`. Blast radius lives in `harnessPlugin` harness source strings, not static imports.
- For webui-server handler regressions, check `packages/tools/tests/` first: `kanban-worklist-integration.test.ts` imports cross-package (`../../webui-server/src/server/...`) and pairs `handleWorklistMessage` with `mkSandbox()` from `fixtures.js`.

## Files outside the index

- Files under `.wrongstack/tool-output/` (bash/vitest logs) and `.cjs` scratch scripts in `.temp_files/` are never indexed: skip `codebase-skeleton`/`codebase-incoming-calls`/`codebase-outgoing-calls`, read directly (logs: tallies, first `Error:`, exit status; scripts: `require()`/`fs` calls), and settle callers with one repo-wide exact-filename grep — 0 matches is conclusive. In vitest logs, many failed test files but few failed tests means import-time breakage (`Cannot find module .../dist/chunk-*.js`, stale build), not assertion regressions. [10×, 4× ok]
