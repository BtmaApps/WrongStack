# explore-companion Role Instructions

## Result Submission

- Submit probe results through `submit_result`; this role has no `mailbox` send capability.
- Keep all `submit_result` fields ASCII-only. If populated fields trigger a "required" validation error, shorten combined text and multiline content; about four short findings and a compact `files_examined` list is reliable.
- Separate confirmed findings from unavailable or inconclusive checks. An unavailable reference graph is not evidence of no callers.

## Evidence and Search Discipline

- Inspect the current working tree and `git diff HEAD` before describing work as pending; todo state can lag edits.
- Read named files directly. Empty `glob` or `grep` results do not prove absence in `.temp_files/`, `node_modules`, or snapshot directories.
- Verify external Vitest snapshots with `read` on `packages/<pkg>/tests/__snapshots__/<test>.snap`. Read snapshot keys before assessing renames, invalidation risk, or test blast radius.
- Re-read files under concurrent editing immediately before reporting. Changes in `total_lines` between skeleton and read results indicate drift; report the latest state and changed region rather than stale line anchors.
- Validate unfamiliar search expressions against a known positive before trusting zero hits. Check token order, relative-path depth, extensions, and filtering.
- Treat `truncated=true` as incomplete output. Grep content mode may show only three matches per file; narrow searches or read files before claiming an exhaustive list.
- Use `codebase-incoming-calls` as corroboration, not sole proof of consumers. For generic symbols such as `Action`, `State`, or `create`, use qualified text searches and inspect hits.
- If indexing fails with `Index build failed: Project files changed during indexing`, fall back to exact-text searches instead of repeatedly rebuilding the index.
- Avoid brace-expansion patterns such as `packages/**/*.{ts,tsx}` with `glob`; use separate single-pattern globs per suffix.
- For vague probe symbols, search the distinctive phrase from the supplied context first. Do not map common error words to unrelated source symbols.

## Consumer and Ownership Tracing

- Combine exact module-specifier searches with exported-symbol searches. Follow barrels, package subpath exports, aliases, registrations, and type-only imports before declaring a module unused.
- Resolve relative imports from their containing directories and search source `.js` specifiers as well as extensionless forms. Exclude unrelated same-basename modules.
- Use header comments to identify intended consumers, then verify the named wiring. Before classifying a zero-importer helper under `packages/*/tests/helpers/` as dead or safe to delete, inspect its documented consumer and validate the search with a known sibling such as `create-test-state`.
- Separate searches for a test's full filename from searches for the production module stem. Classify metadata, documentation, value imports, and `import type` hits separately.
- To map behavior exercised by a test, trace the production symbols it imports. To map references to the test itself, search its exact filename.
- Read `package.json` and `pnpm-workspace.yaml` directly for scripts, exports, workspace membership, and `link:` overrides; manifests are not reliably represented in reference graphs.
- Treat textual contracts, filesystem readers, and comment/string references as dependencies even when `codebase-incoming-calls` cannot see them.
- Scope webui searches to `packages/webui/src` and `packages/webui/tests` to avoid `dist/` source-map noise. Check `packages/simpleui` before attributing same-named component edges to webui.

## Scratch Scripts and Execution Evidence

- Read a named `.temp_files/` script in full before mapping dependencies or risk. If `read` returns `ENOENT`, pair it with an exact filename search; do not infer contents from neighboring files.
- Derive scratch-script dependencies from imports, `require()`, filesystem operations, hardcoded paths, and harness source strings. Code-index graphs do not reliably cover `.temp_files/`.
- Search exact scratch filenames across repository scripts, manifests, and documentation to identify invokers. With `.temp_files/` excluded and no external references, classify the script as manual-run only, not as a repository test gate; do not claim it has never run.
- Inspect `process.argv`, defaults, guards, and external write targets before calling a bare run safe. Zero repository callers do not make a script harmless.
- Flag unguarded `fs.appendFileSync` as duplicate-row risk and hardcoded date constants as stale-result risk. Preserve operational contracts such as restore-in-`finally` and deliberate event/status exclusions.
- For `.temp_files/**/*.mjs` bare imports, directly read each walk-up `node_modules/<pkg>/package.json`; empty globs are not absence evidence. Inspect `exports` because imports may resolve to built `dist/`, not source.
- Use a script's end-of-run artifact, such as its `page.screenshot` output, as evidence of past success. A binary `read` proves the artifact exists; `ENOENT` means there is no retained completion artifact. If that artifact exists while a required dependency is now missing, investigate dependency-state changes since the successful run.
- A per-import `try`/`catch` probe can exit zero despite every lookup failing. Report individual specifier results rather than treating exit status as proof of symbol availability.

## Codemod Re-run Risk

- Before warning about a scratch codemod re-run, inspect its write targets for injected post-condition markers, generated artifacts, consumed extraction markers, and required imports. Determine whether it already ran before assessing a proposed edit.
- For `packages/tui/tests/helpers/key-handler-fixture.ts`, a marker such as `): KeyHandlerFixture {` and dependent imports such as `Mock` from `vitest` and `KeyEvent` help establish generated state. Confirm the script's actual guard and write ordering rather than assuming marker presence alone makes every re-run safe.
- Check backup ordering: unconditional `fs.writeFileSync(BACKUP, ...)` before the first anchor guard can overwrite the original backup even when the target later remains unchanged. Prove `.temp_files/` backup presence or absence with direct `read`, not `glob`.
- Distinguish self-preserving insertion from consumed anchors. `replace(ANCHOR, ANCHOR + additions)` retains its needle and can pass `must()` repeatedly; a fully consumed `swap()` anchor can make a re-run fail before writes.
- If a codemod builds one in-memory string and writes the target only at the end, a prior anchor failure leaves that target untouched. Inspect earlier backup and generated-file writes separately.
- Treat marker reintroduction as a re-arming risk: `writeFileSync` without `'wx'` can clobber hand-edited generated files once extraction guards pass again.
- Prove helper-module existence with a filename lookup or direct read, not a content search for the module's own name.

## Browser Harnesses

- Map browser harness blast radius through embedded fixture source, selectors, button-name regexes, and stubbed APIs, not only static imports. Component/store changes can break a manual harness while every repository test stays green.
- For `.temp_files/` chat/file-picker harnesses, inspect `[data-chat-textarea]`, FilePicker button locators, and `getWSClient` stubs including `listFiles`, `files.list`, `send`, and `isConnected` defined through `defineProperty`.
- Check whether scratch harness dependencies `vite` and `@playwright/test` resolve through `createRequire` anchored at `packages/webui/package.json`, rather than from the scratch directory.
- Treat `packages/webui/tests/*.mjs` browser-smoke scripts as Node entry points, not Vitest suites. Read `packages/webui/package.json`, search both filename and script name, and run with `cd packages/webui && pnpm run <script>`.
- Inspect inline Vite plugins such as `harnessPlugin`; virtual-module source strings define the UI under test and its reverse dependencies.

## External Artifacts

- Read unfamiliar OS-temp files directly; `read` accepts absolute out-of-project paths. Search the exact filename/stem for repository references, then identify content ownership rather than treating the artifact as an unindexed source module.
- Resolve discriminators such as `__report:1` and `__reportEvent:1` with `codebase-search`; review-report schemas belong in `packages/core/src/plugins/review-report-store.ts`.
- Treat files under the user's `.wrongstack/tool-output/` directory as captured logs. Skip source-reference graphs; extract the command, final tallies, first root-cause error, and exit status.
- In Vitest logs, many failed test files but few failed tests often indicate collection/import-time failures rather than assertion regressions. Investigate missing built chunks before attributing failures to source behavior.

## TUI Contracts

- Treat `packages/tui/tests/key-handler-replay-corpus.test.ts` as a behavioral acceptance contract for `createAppKeyHandler`. Its keys couple to `packages/tui/tests/__snapshots__/key-handler-replay-corpus.test.ts.snap`.
- The replay corpus's `makeHandler` options use `as never as Parameters<typeof createAppKeyHandler>[0]`, which can hide options-type drift. Inspect runtime results and snapshot diffs rather than relying on TypeScript alone.
- Check call-order documentation in `packages/tui/src/key-routes/key-route-composer.ts` and `packages/tui/src/key-routes/key-route-pointer.ts` when changing replay behavior.
- Before deleting or moving leak-pin `describe` blocks, inspect the `UNSWEPT` ownership map in `packages/tui/tests/leaked-mouse-input-sweep.test.tsx`. Its exclusions point to sibling mount tests, including `packages/tui/tests/kanban-panel-mount.test.tsx`, through comment/string coupling invisible to call graphs.
- `packages/tui/src/components/status-bar.tsx` is a facade. Locate helper behavior in defining siblings and treat removal of facade exports as breaking.
- `packages/tui/src/theme.ts` exposes a mutable singleton updated by `setActiveTheme()`, not React context. For preset changes, inspect `theme-presets.ts`, `theme-types.ts`, and `theme-utils.ts`.
- Treat `packages/tui/tests/theme-contrast.test.ts` as calibrated measurement coverage. Re-measure presets before changing floors, mirror preset IDs in `THEME_PRESET_IDS` from `@wrongstack/core/types`, and preserve luminance ordering used by `syntax.commentOnWash`.

## Webui Boundaries and Contracts

- `packages/webui/src/components/ChatView.tsx` re-exports `ChatView/index.tsx`. `ChatInput.tsx` owns runtime pieces under `ChatInput/`; distinguish their runtime imports from shared type-only dependencies.
- For routable components, inspect `packages/webui/src/components/view-registry.ts` and `components/index.ts`. Feature-directory leaf components and ChatInput submodules need not have registry entries.
- The store barrel is `packages/webui/src/stores/index.ts`, often imported as `@/stores`; behavior lives in sibling store files.
- Browser imports of bare core can resolve through `packages/webui/src/lib/core-browser-shim.ts`. Trace subpaths such as `@wrongstack/core/kernel`, `@wrongstack/core/coordination`, and `@wrongstack/core/types` separately.
- `packages/webui/tests/lib/session-scoped-send-stamping.test.ts` textually checks all webui source. For send-site edits, search `session-stamping: stamped-at-helper` and `session-stamping: deliberately-unstamped`; call graphs cannot capture this contract.
- Start pattern broadcast probes at `packages/webui-server/src/server/setup-events-pattern-handlers.ts`; inspect `projectWide()` versus `sessionPayload()`.
- `sessionPayload` in `packages/webui-server/src/server/connection-handler.ts` fills missing payload session IDs from the foreground session. Trace producer emit sites before proposing routing guards.

## Webui i18n

- Trace translations through `useAppTranslation()` exported by `packages/webui/src/i18n/index.ts`. Count namespace references with patterns such as `rg "['\"]activity:" packages/webui/src`.
- Production catalogs load through `resourcesToBackend`; `activity` and `settings` use deferred `i18n.loadNamespaces` loading and must remain lazy chunks.
- Search catalog path fragments such as `locales/en/<ns>` across the repository to catch static imports, `require`, and dynamic references.
- Inspect `packages/webui/tests/i18n/catalog-integrity.test.ts` for English key parity, nonblank values, and translation-reference coverage including plural forms. Search all JSON under `packages/webui` before calling a key unresolved.
- `packages/webui/tests/i18n/deferred-namespaces.test.ts` guards lazy loading. Verify i18n changes with `cd packages/webui && npx vitest run tests/i18n`.

## Verification and Focused Lookup

- Derive test commands from package scripts and resolved Vitest configurations. Enumerate candidate test names before mapping coverage; filenames alone can miss relevant cases.
- Root Vitest excludes `packages/webui/**`. Use `cd packages/webui && npx vitest run <file>` or package scripts; webui server tests use the node project, while other test suites use `browser-jsdom`.
- Run `packages/cli/tests/hq-dashboard.test.ts` through `pnpm --filter @wrongstack/cli test:hqdash`; ordinary CLI test commands may omit it.
- Check `packages/tools/tests/kanban-worklist-integration.test.ts` for cross-package worklist/session-routing coverage. Its real `handleWorklistMessage` plus `mkSandbox()` from `packages/tools/tests/fixtures.js` is an established integration pattern.
- For ambiguous task language, search targeted test comments and distinctive tokens before broad source symbols.
- Before claiming a `CallType` is missing, read `packages/tools/src/codebase-index/schema.ts`; `type_ref` is emitted by `ts-parser.ts`, not the tree-sitter rule tables.
- For `<providerId> HTTP <status>` errors, inspect `parseProviderHttpError()` in `packages/providers/src/error-parse.ts`, `classifyProviderError()` in `packages/core/src/types/provider.ts`, and `ProviderError.body`; do not classify every 403 as authentication failure.