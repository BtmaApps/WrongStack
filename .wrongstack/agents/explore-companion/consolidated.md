# explore-companion Role Instructions

## Result Submission

- Submit every probe result through `submit_result`; this role does not have the `mailbox` send capability.
- Keep all `submit_result` fields ASCII-only. Unicode punctuation has caused schema validation failures.
- Keep reports compact. If populated fields produce a "required" validation error, shorten the combined finding text and multiline content rather than only reducing the finding count. About four one- to two-line findings plus a short `files_examined` list is a reliable shape.
- Distinguish confirmed findings from unavailable or inconclusive checks. Never turn an unavailable reference graph into a claim of no callers.

## Evidence and Search Discipline

- Inspect the current working tree, including `git diff HEAD`, before describing work as pending; todo state can lag partially completed edits.
- Treat `codebase-incoming-calls` as supporting evidence, not sole proof that a symbol has no consumers. Confirm absence with targeted exact-text search across relevant source, tests, scripts, and documentation.
- Treat `truncated=true` as proof that a grep result is incomplete even when `shown` equals `count`. Cross-check importer or caller maps with `codebase-incoming-calls` and read the highest-priority hit before reporting it.
- The grep content mode may display only the first three matches per file even when `count` is larger. For exhaustive lists, narrow the search or read the relevant line ranges; never present the displayed subset as complete.
- Validate a novel search expression against a known positive example before trusting a zero result. A valid regex can still target the wrong token order or path depth.
- Do not use `codebase-incoming-calls` or `codebase-impact-analysis` as authoritative blast-radius tools for generic symbols such as `Action`, `State`, or `create`. Use qualified expressions such as `(sessionStore|store)\.create\(` and inspect each hit. For type-only modules, combine an exact module-specifier grep with a search for symbols re-exported by known barrels.
- If `codebase-incoming-calls` fails with `Index build failed: Project files changed during indexing`, do not loop on indexing. Fall back to exact-text search and report that the reference graph was unavailable.
- When a probe's `hint.symbol` is a common word such as `The`, `Failed`, or `Cannot`, first search the full distinctive phrase from its `context`. If that phrase has no repository hit, treat the symbol as a probable extraction from a runtime or dependency error rather than mapping fuzzy near-miss names.
- Do not rely on file-header comments to identify importers or owners. Verify the current import block, barrel, registration site, or writer that the comment names.

## Scratch-Probe Inspection

- Read a named `.temp_files/` file before mapping it. If `read` returns `ENOENT`, pair that result with a repo-wide exact filename search; do not infer contents from similarly named neighbors or use an empty `glob` as proof because ignore rules can hide `.temp_files/`.
- Re-read every named scratch script immediately before reporting. If earlier snapshots disagree, concurrent editing is likely: report only the latest on-disk state and identify the earlier snapshot as superseded in one line.
- `codebase-index` and reference graphs do not cover `.temp_files/`. To find repo invokers of a scratch script, search its exact filename across the repository, including `scripts/`, documentation, and package manifests.
- A zero-hit filename search supports "no repo textual invoker," but not "never run manually." Read every nonzero hit before classifying it as a caller; test fixtures and unrelated paths can contain the same basename coincidentally.
- If a script's own usage comment contains its filename but the filename search returns zero, hidden-file filtering likely excluded `.temp_files/`; this strengthens rather than weakens the no-invoker conclusion.
- Derive a scratch script's outgoing dependencies directly from its full contents, including `require()` or `import`, filesystem calls, and hardcoded paths. `codebase-outgoing-calls` is not authoritative for `.temp_files/`.
- Inspect `process.argv`, default paths, and guards before calling a bare run safe. An `fs.existsSync` guard degrades to a missing-path message; an unguarded `readFileSync` throws `ENOENT`; a script requiring an explicit argument has no default target and cannot fail on a missing default.
- Evaluate scratch-script blast radius from hardcoded external targets as well as repository references. A script targeting `C:/Users/<user>/.wrongstack/projects/<id>` can mutate `review-reports.jsonl`, `review-findings.jsonl`, or `.review-store-maintenance.json` even with zero repo callers.
- Flag additive probes that use `fs.appendFileSync` without an idempotency check. Repeated bare runs can stack duplicate rows; cleanup may require deduplication by a namespaced identifier.
- Scan scratch scripts for hardcoded date constants such as `TODAY = 'YYYY-MM-DD'`. Date-keyed counts can silently return zero and look like missing data.
- Preserve self-documented operational and classification invariants when describing a script. Treat restore-in-`finally`, no-unsettled-await-at-exit, excluded event types, terminal-status sets, coupled calculations, and deliberate payload choices as edit contracts.
- A bare `await import(spec)` probe from `.temp_files/` usually follows the package's `exports` map, often to built `dist/`, rather than source. Inspect the package's `exports` map before claiming source behavior, or label the target as assumed.
- A probe that wraps each per-specifier import in `try`/`catch` may exit zero even when every lookup fails. Validate and report each specifier result; never use the process exit code as proof that symbols exist.

## Tool-Output Artifacts

- Treat any probe naming a file under the user's home `.wrongstack/tool-output/` directory as a captured tool-output artifact (bash/vitest logs), never a source module. The code index covers only the project root, so skip `codebase-skeleton` and `codebase-incoming-calls` entirely; read the file directly to extract the captured command's signal — final tallies, the first `Error:` root cause, exit status — then run one repo-wide exact-filename grep for references. A zero-match there is conclusive proof of no importers.
- For vitest logs specifically, compare "Test Files failed" against "Tests failed": a large file-failure count with a small test-failure count means collection/import-time breakage (e.g. `Cannot find module .../dist/chunk-*.js` from a stale build), not assertion regressions.

## Importer and Consumer Tracing

- Search the exported symbol name repo-wide before concluding that a module is unused. Barrel and binding re-exports preserve the symbol while removing the original module specifier from downstream source.
- Pair a symbol search with a direct specifier search to distinguish direct importers from barrel consumers. Read each hit's import block before classifying the dependency.
- Account for path depth when searching relative ESM imports. For example, files under `packages/core/src/skills/suggest/` may import `packages/core/src/typesafe/*` through `../../typesafe/index.js`, so a search limited to `../typesafe` can produce a false zero.
- Treat `<module>` edges from files such as `skills/index.ts` or `skills/suggest/index.ts` as possible re-export chains. Search the underlying symbol to find its real use sites.
- Treat package barrels and subpath exports as import boundaries: CLI consumers under `packages/cli/src/webui-server/` may import only `@wrongstack/webui-server`, so trace symbols repo-wide. Do not assume every module under `packages/webui-server/src/server/` is re-exported by `server/index.ts` — verify per module with an exact-specifier grep for the filename. `backend-services.ts` is a counter-example: reachable only via deep relative paths (`start-webui.ts` at runtime, `start-webui-shutdown.ts` type-only).
- Core symbols may be reachable through `packages/core/src/goal/index.ts`, `packages/core/src/index.ts`, and the `@wrongstack/core/goal` subpath. A search for `phase-orchestrator` alone misses consumers of `PhaseOrchestrator` through those layers.
- Resolve every relative import from its containing directory before counting it. Search source `.js` specifiers as well as extensionless forms, and exclude distinct same-basename modules.
- Distinguish routable views from leaf components before tracing webui importers. A routable component `X` has a `const X = lazy(() => import('./X'))` registration in `packages/webui/src/components/view-registry.ts` — a duplicate declaration that can mislead `codebase-incoming-calls` — plus a re-export in `packages/webui/src/components/index.ts`; build its importer map from those two sites and exact-symbol searches under `packages/webui/src` and `packages/webui/tests`.
- Components nested inside a feature directory (e.g. `packages/webui/src/components/TechStackView/RemediationTab.tsx`) are leaf sub-tabs: statically imported by that feature's `index.tsx` and never registered in `view-registry.ts`. For such leaves, the authoritative importer map is an exact-name grep scoped to `packages/webui/src` and `packages/webui/tests`, corroborated by `codebase-incoming-calls` on the export.
- Never grep webui through `packages/webui/**`; `dist/` source maps can flood the result and hide real source importers. Also inspect same-named components in `packages/simpleui` before attributing a graph edge to webui.
- When a probe names a test file that shares its basename with a production module (e.g. `sdd-wizard-ws-handler.test.ts` vs `src/server/sdd-wizard-ws-handler.ts`), run two separate greps: the full `<name>.test.ts` filename for test references (expect only metadata JSON such as `docs/reports/architecture-health-current.json`) and the bare module stem for production consumers. Classify each `src/` hit by its import line (value import vs `import type`) before reporting the consumer map; a single bare-stem grep conflates the two and overstates the test file's blast radius.
- To find production wiring exercised by a test, run `codebase-incoming-calls` on the production symbol imported by the test. To find references to the test file itself, use a repo-wide exact filename search and inspect metadata or documentation hits rather than expecting import statements.
- Treat manifests as index-blind. Read the full `package.json`, inspect `pnpm-workspace.yaml` for `packages:` membership and `link:` overrides, and search `scripts/` for exact `package\.json` references when programmatic manifest readers or writers matter.
- Treat the root `CHANGELOG.md` as filename-coupled rather than import-coupled. Its relevant surfaces are `changelog-writer`'s `filePath`, `semver-bump`'s `changelogFile`, `doc-sync-guard`'s `docNames`, release-bump automation, and the mirrored website data in `website/src/lib/utils.ts`.
- Before calling a root changelog edit risky, inspect structure such as the `## [Unreleased]` heading and configured path. Test-tree `CHANGELOG.md` hits are commonly node-module mocks or configuration defaults, not consumers of the root file.

## Ambiguity Resolution

- Search a leader's coined phrase under `packages/*/tests/**` before source identifiers; regression-test comments often preserve the task language before a production symbol is named.
- Disambiguate overloaded concepts by inspecting targeted tests and the surrounding request. For example, an `Engine` request may refer to multiple core subsystems, so `packages/core/tests/**/*engine*` is stronger initial evidence than a repository-wide symbol search.
- Cluster multi-part work with precise source tokens such as `rg 'P0-\d'` over `packages/{cli,core}/src`. Use similarly precise test tokens such as `SIGKILL`, `killed-session`, or `never-closed` instead of broad terms like `kill`.
- Anchor a documentation filename search to its suffix, such as `techstack\.md`, when the bare term is dominated by lockfiles or manifests. Determine ownership by reading the actual writer.
- Before reporting that `CallType` is missing, read the full union in `packages/tools/src/codebase-index/schema.ts`. `type_ref` is emitted by `ts-parser.ts`, not the tree-sitter `refRules` tables in `packages/tools/src/codebase-index/tree-sitter/queries.ts`.
- Interpret a todo suffix such as "resolve X memory" as knowledge capture: search `.wrongstack/agents/**/learned.md` for the term and identify the missing note. Ignore generic boilerplate in `.wrongstack/domain-terms.md` as current-task evidence.
- For errors shaped `<providerId> HTTP <status>`, trace the source to `parseProviderHttpError()` in `packages/providers/src/error-parse.ts`, not a generic `HTTP` symbol. Read `classifyProviderError()` in `packages/core/src/types/provider.ts` and the parsed `ProviderError.body` before assuming a consumer bug or treating every 403 as an authentication failure.

## Project Boundaries

### Webui

- `packages/webui/src/components/ChatView.tsx` is a re-export shim for `packages/webui/src/components/ChatView/index.tsx`; the directory implementation owns component behavior.
- `packages/webui/src/components/ChatInput.tsx` is the owner component for the `ChatInput/` feature directory: it imports runtime pieces from `./ChatInput/*` (e.g. `file-mention-picker.js`), while siblings such as `session-draft.ts` and `use-chat-keydown.ts` share only types (e.g. `FileMentionState`) via `import type`. ChatInput submodules have no `view-registry.ts` registration; build their importer map from greps scoped to `packages/webui/src` and `packages/webui/tests`.
- The webui store barrel is `packages/webui/src/stores/index.ts`, commonly consumed through `from '@/stores'`. Store behavior belongs in sibling files such as `packages/webui/src/stores/<name>-store.ts`.
- In browser code, the bare core specifier resolves through `packages/webui/src/lib/core-browser-shim.ts`; a hit there does not prove direct use of `packages/core/src/index.ts`.
- Trace internal core usage through subpaths such as `@wrongstack/core/kernel`, `@wrongstack/core/coordination`, and `@wrongstack/core/types` before attributing a dependency to the bare compatibility barrel.
- `packages/webui/tests/lib/session-scoped-send-stamping.test.ts` is a repo-wide textual lint over all of `packages/webui/src`, not an isolated unit test: its effective dependents are every `send(...)` call site. Before reporting the blast radius of webui send-site edits, grep `packages/webui/src` for the opt-out markers `session-stamping: stamped-at-helper` and `session-stamping: deliberately-unstamped`. `codebase-incoming-calls` is useless here — the test exports nothing and reads source via `fs`.
- Treat `packages/webui/tests/*.mjs` browser-smoke scripts as npm-script-driven node entry points, not vitest tests: they export nothing and use top-level await, so `codebase-incoming-calls` is inapplicable. Map callers with two exact-text greps — the filename repo-wide (expect self-hits only) and the script name in `packages/webui/package.json` (the sole invoker, e.g. `test:user-input-browser`). Run via `cd packages/webui && pnpm run <script>`.
- Browser-smoke scripts' static deps are `@playwright/test` and `vite`; the UI under test is reached through virtual-module harness sources served by an inline Vite plugin (`harnessPlugin`), so their blast radius lives in the harness source strings, not static imports.

### Webui-Server

- Start any broadcast/routing probe at `packages/webui-server/src/server/setup-events-pattern-handlers.ts`: it is the single fan-out for pattern-based event broadcasts (`mailbox.*`, `brain.*`, `memory.*`, `cron:*`), and its `projectWide()` vs `sessionPayload()` choice documents which frames are per-tab.
- The `sessionPayload` helper in `packages/webui-server/src/server/connection-handler.ts` silently re-stamps a missing payload sessionId with the live foreground session. That fail-open fallback is the known mechanism behind "unaddressed broadcast" bugs; trace producer emit sites (e.g. `ObservableBrainArbiter` in `packages/core/src/coordination/brain.ts`) before proposing a server-side guard.

### Webui i18n

- Webui components generally use the `useAppTranslation()` wrapper exported from `@/i18n` in `packages/webui/src/i18n/index.ts`; `useTranslation('activity')` is not a reliable consumer proxy.
- Production locale catalogs are backend-loaded. `resourcesToBackend` dynamically imports locale JSON, while `activity` and `settings` are deferred through `i18n.loadNamespaces` and must remain lazy chunks.
- Count namespace consumers with a quote before the namespace and a colon after it, such as `rg "['\"]activity:" packages/webui/src`. The inverted pattern `activity:['"]` misses calls such as `t('activity:nav.chat')`.
- Search direct catalog imports by the bare path fragment `locales/en/<ns>` repo-wide, not only by an `import ... from` shape. Tests use `require(...)` and dynamic forms that import-statement regexes miss.
- Known direct `settings` readers are `packages/webui/tests/i18n/locale-switch.test.tsx` and `packages/webui/tests/components/yolo-confirm-list.test.tsx`; `packages/webui/tests/components/view-registry.test.ts` directly references the `activity` catalog. Verify import blocks because dynamic filenames can create coincidental text matches.
- Before reporting locale blast radius, inspect `packages/webui/tests/i18n/catalog-integrity.test.ts`. It guards English key-set parity, rejects blank or whitespace-only values, and requires every `t()` reference, including `_one` and `_other` plural forms, to resolve.
- Search all JSON resources under `packages/webui`, not only `packages/webui/src`, when claiming a key is unresolved. `packages/webui/tests/i18n/deferred-namespaces.test.ts` separately guards lazy backend loading for `activity` and `settings`.
- Compare top-level section counts between `<lng>/<ns>.json` and `en/<ns>.json` with `rg '^ "[^"]+": \{'` as a fast gross-drift check. Run `cd packages/webui && npx vitest run tests/i18n` for leaf-key proof.

### TUI

- `packages/tui/src/components/status-bar.tsx` is a facade that defines `StatusBar` and re-exports helpers, icons, and types from sibling modules. Put behavior such as `renderProgress` or `fmtElapsed` in the defining sibling, and treat removal of a facade export as breaking.
- `packages/tui/src/theme.ts` owns a mutable `theme` singleton updated in place by `setActiveTheme()`. Theme changes propagate through the shared object rather than React context; definitions are split across `theme-presets.ts`, `theme-types.ts`, and `theme-utils.ts`.
- Treat `packages/tui/tests/theme-contrast.test.ts` as a calibrated measurement record, not a style assertion. Re-measure every preset before changing a preset or its floors, mirror preset-id changes in `THEME_PRESET_IDS` from `@wrongstack/core/types`, and preserve luminance ordering because it feeds `syntax.commentOnWash`.

## Verification Surfaces

- Derive verification commands from the touched package's `package.json`, the root `vitest.config.ts` exclusions, and, for release work, `.reports/release-check-matrix/*.log`. Prefer the narrowest command that includes the affected suite.
- Root Vitest excludes `packages/webui/**`. Run webui tests with `cd packages/webui && npx vitest run <file>` or the package-level script.
- `packages/webui/vitest.config.ts` separates `tests/server/**` from other webui tests. Server suites use the node project; other `tests/**/*.test.{ts,tsx}` suites use `browser-jsdom`.
- `packages/cli/tests/hq-dashboard.test.ts` runs through `pnpm --filter @wrongstack/cli test:hqdash` and `packages/cli/vitest.hqdash.config.ts`; ordinary CLI Vitest commands may omit it.
- Check `packages/tools/tests/` first when probing for integration-regression coverage around webui-server handlers: `packages/tools/tests/kanban-worklist-integration.test.ts` reaches webui-server source via a cross-package relative import (`../../webui-server/src/server/...`) and pairs real `handleWorklistMessage` with the `mkSandbox()` fixture from `packages/tools/tests/fixtures.js`. That pair is the established integration-harness pattern for worklist/session routing regressions; such coverage is not a webui-server-local test.
- Enumerate all `it()` or `test()` names in candidate files before mapping coverage. Grab-bag test files often contain behavior tests whose filenames do not match the symbol.
- A green root test run is not proof that excluded package tests ran. Confirm the resolved configuration and captured test names.
- Avoid brace-expansion globs such as `packages/**/*.{ts,tsx}` with the `glob` tool because they can silently return zero files. Use one single-pattern glob per suffix.
- The todo store may have no materialized file. When absent, use an mtime-ordered single-pattern source glob together with `git diff HEAD` to establish current worktree state.