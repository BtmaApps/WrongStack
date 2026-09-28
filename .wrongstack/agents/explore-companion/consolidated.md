# explore-companion Role Instructions

## Result Submission

- Submit probe results through `submit_result`; this role has no `mailbox` send capability.
- Keep all `submit_result` fields ASCII-only. If required-field validation fails, shorten the combined text and multiline content; roughly four concise findings and a compact `files_examined` list are reliable.
- Separate confirmed findings from unavailable or inconclusive checks. An unavailable reference graph is not evidence that a symbol has no consumers.

## Evidence and Search Discipline

- Inspect the current working tree and `git diff HEAD` before describing work as pending; todo state can lag edits.
- Read named files directly. Empty `glob` or `grep` results do not prove absence in gitignored, unindexed, snapshot, or scratch directories.
- Validate unfamiliar search expressions against a known positive before trusting zero hits. Check token order, path depth, extensions, and implicit filtering.
- Treat `truncated=true` as incomplete output. Grep content mode may also cap matches per file, so narrow searches or read files directly before claiming an exhaustive list.
- Avoid brace-expansion patterns such as `packages/**/*.{ts,tsx}` with `glob`; use separate single-pattern globs per suffix.
- Re-read files under concurrent editing immediately before reporting. A changed `total_lines` or modified region indicates drift and invalidates stale line-based conclusions.
- Read external Vitest snapshots directly from `packages/<pkg>/tests/__snapshots__/<test>.snap`; snapshot keys are part of the test contract.
- Use `codebase-incoming-calls` as corroboration, not sole proof of consumers. For generic symbols such as `Action`, `State`, or `create`, use qualified text searches and inspect the hits.
- If indexing fails with `Index build failed: Project files changed during indexing`, fall back to exact-text searches instead of repeatedly rebuilding the index.
- For vague probe symbols, search a distinctive phrase from the supplied context before broad source symbols; do not map common error words to unrelated implementations.

## Hidden and Scratch Directories

- Resolve `.temp_files/` targets with direct `read` and `tree`. `glob` and `grep` are rg-backed, respect `.gitignore`, and may silently omit this directory; `read` returning `ENOENT` at the resolved path is authoritative for that checkout.
- When a missing `.temp_files/` filename embeds a cluster name, such as `commit-msg-project-kit.txt` mapping to `.temp_files/project-kit/`, enumerate that same-stem directory with a complete tree. Perform this relocation check only after the original path returns `ENOENT`; a successful read already proves presence.
- If a leader or peer reports editing a file that is locally absent, report checkout-relative absence and possibly an isolated worktree. Never infer the file’s contents from neighboring scratch files.
- Do not assume all of `.wrongstack/` is invisible: the codebase index covers `.wrongstack/project-kit/**`, while rg-backed `grep` and `glob` can skip it. Use `read` for known paths and `codebase-search` or `codebase-incoming-calls` for symbols; treat grep/glob zero hits as non-evidence.
- Confirm index visibility with a known path such as `.wrongstack/AGENTS.md` before concluding that discovery behavior is global.
- When tallying `project_kit_run` outcomes, parse the error from the thrown value when available because `project-kit.ts` `execute` throws `JSON.stringify(result)`. The persisted `.wrongstack/project-kit-runs/.../record.json` retains `status`, `durationMs`, and `runId` but redacts `error` to a generic string.

## Consumer and Documentation Lookup

- Combine exact module-specifier searches with exported-symbol searches. Follow barrels, package subpath exports, aliases, registrations, type-only imports, filesystem readers, and comment/string references before declaring a module unused.
- Resolve relative imports from the target module’s directory and search both extensionless and `.js` forms. Exclude unrelated same-basename modules.
- For a same-basename module such as `packages/tools/src/project-kit/schema.ts`, search the target directory with `\./schema(\.js)?['"]`, then corroborate repo-wide with the absolute substring `project-kit/schema`. A broad search under `packages/tools` can be dominated by `codebase-index/schema.ts`.
- For Markdown, skip `codebase-skeleton`; read the file directly to preserve section structure. Find textual dependents with exact basename or stem searches, then separate real path references from name-colliding identifiers because `codebase-incoming-calls` does not model Markdown imports.
- Search a test’s exact filename separately from its production module stem. Classify metadata, documentation, value imports, and `import type` hits separately.
- To map behavior exercised by a test, trace the production symbols it imports. To map references to the test itself, search the full test filename.
- Read `package.json` and `pnpm-workspace.yaml` directly for scripts, exports, workspace membership, and `link:` overrides; manifests are not reliably represented in reference graphs.

## Project-Kit Fixture and Runtime Contracts

- Inventory `.wrongstack/project-kit/<kit>/fixtures/**` with `tree` at unlimited depth or depth ≥ 6. A shallow tree can report `truncated=false` while silently pruning deeper files; verify unexpected counts with a deeper tree or direct `read`.
- Classify every fixture data file as either a name-existence contract, such as collision seeds, `.staged`/`.aged` marker entries, or occupancy pre-seeds, or a content contract whose `bytes` are pinned in `kit.json` under `tests[].expected`.
- Treat deletions, renames, and top-level additions to name-existence fixtures as potentially changing `scanned` or candidate expectations. Reserve content-edit warnings for fixtures with pinned `bytes` or equivalent explicit content assertions.
- Search `\.aged` and `\.staged` when inspecting marker machinery. A bare search for `aged` also matches `.staged`, “staged,” and unrelated prose.
- Interpret fixture-data “incoming calls” as contract sites, not as a runtime call graph. For `temp-file-sweeper`, inspect `kit.json` `tests[]` entries naming fixture roots such as `@git/fixtures/aged`, any pinned `bytes`, and sibling `.staged`/`.aged` arrays consumed by `initializeWorkTree()` and `ageFixtureFiles()`.
- Treat `kit.json` `tests[]` and the kit guide’s “Known limits” section as the coverage contract. Fixture directories not referenced by declared tests are covered only by ad hoc probes unless another durable contract exists.
- Disambiguate `runner.ts` by responsibility before tracing behavior:
  - `packages/tools/src/project-kit/runner.ts` owns child-process IPC, `BOOTSTRAP`, `process.send`, and `runKitProcess`.
  - `packages/core/src/hooks/runner.ts` owns in-process `HookRunner` orchestration and has no project-kit IPC bootstrap.
  - `packages/bench/src/runner.ts` owns subprocess benchmarking through `runWstack`.
- Start project-kit child-process or `process.send` investigations at `packages/tools/src/project-kit/runner.ts`. Its regression harness is `fixture()` and `f.run('verify', input, rev, signal?)` in `packages/tools/tests/project-kit.test.ts`, while production `runKitProcess` is called by `executeKit` in `packages/tools/src/project-kit/service.ts`.
- Compare filesystem roots with `fs.realpath`, not lexical `path.resolve`. In particular, canonicalize both `git rev-parse --show-toplevel` and `mkdtemp(os.tmpdir())` scratch roots before equality checks so symlinks and Windows 8.3 short names do not create false differences.

## Scratch Probes, Harnesses, and Codemods

- Read a named `.temp_files/` script in full before mapping dependencies or risk. Code-index tools such as `codebase-search` and `codebase-incoming-calls` do not cover `.temp_files/`.
- Derive scratch-script dependencies from imports, `require()`, filesystem operations, hardcoded paths, embedded source strings, selectors, and stubbed APIs—not static imports alone.
- Treat A/B harnesses that derive one arm from live source through string replacement as drift-sensitive. Search the exact replacement anchors in the production file, and flag edits to mutual-exclusion or validity guards as experiment-invalidating.
- Before trusting a failure-classification regex, verify its exact error phrase in the current production source. For example, a probe using `/without a successful result/` against `packages/tools/src/project-kit/runner.ts` can report zero failures solely because the production message changed.
- Treat `.temp_files/commit-msg*.txt` files as scratch commit-message drafts with no code consumers. Before reuse, compare the `File list:` line with staged files and revalidate embedded claims such as timeouts, SHAs, and guard results against the actual change.
- Search exact scratch filenames across repository scripts, manifests, and documentation to identify invokers. With `.temp_files/` excluded and no external references, classify the script as manual-run only, not as a repository gate and not as never having run.
- Inspect `process.argv`, defaults, guards, and external write targets before running a scratch script. Zero repository callers does not make it safe; watch for `fs.appendFileSync` duplicate writes, hardcoded dates, and unrestored state.
- For bare imports from `.temp_files/**/*.mjs`, read each walk-up `node_modules/<pkg>/package.json`. Inspect `exports` because an import may resolve to built `dist/` output rather than source.
- A per-import `try`/`catch` probe can exit zero even when every lookup fails. Report each specifier result rather than treating process status as proof of availability.
- Use end-of-run artifacts, such as screenshots or generated reports, as evidence of past success. A binary `read` proves the artifact exists; `ENOENT` means no retained completion artifact remains.
- Before warning that a scratch codemod may re-run, inspect write targets for post-condition markers, generated artifacts, consumed anchors, required imports, and guard ordering.
- Check backup ordering: writing `BACKUP` before the first anchor guard can overwrite the original backup even when the target remains unchanged. Prove backup presence or absence with direct `read`.
- Distinguish self-preserving insertion from consumed anchors. `replace(ANCHOR, ANCHOR + additions)` can pass repeatedly, while `swap()` may fail before writing on a second run.
- Remember that an in-memory transformation followed by one final target write leaves the target untouched when an earlier anchor fails; inspect separate backup and generated-file writes independently.

## Browser Harnesses and External Artifacts

- Map browser-harness blast radius through embedded fixture source, selectors, button-name regexes, virtual modules, and stubbed APIs, not only static imports.
- Check whether scratch harness dependencies such as `vite` and `@playwright/test` resolve through `createRequire` anchored at a package manifest rather than from the scratch directory.
- Treat `packages/webui/tests/*.mjs` browser-smoke scripts as Node entry points, not Vitest suites. Read `packages/webui/package.json` and run them with `cd packages/webui && pnpm run <script>`.
- Inspect inline Vite plugins and virtual-module source strings; they define the UI under test and its reverse dependencies.
- Read unfamiliar OS-temp files directly with absolute paths. Search their exact filename or stem for repository references before classifying them as external artifacts.
- Treat files under the user’s `.wrongstack/tool-output/` directory as captured logs. Extract the command, final tallies, first root-cause error, and exit status instead of attempting source-reference graphs.
- In Vitest logs, many failed test files but few failed tests often indicate collection or import-time failures, such as missing built chunks, rather than assertion regressions.

## TUI Contracts

- Treat `packages/tui/tests/key-handler-replay-corpus.test.ts` as a behavioral acceptance contract for `createAppKeyHandler`; its expected results are coupled to `packages/tui/tests/__snapshots__/key-handler-replay-corpus.test.ts.snap`.
- The replay corpus’s `makeHandler` options use `as never as Parameters<typeof createAppKeyHandler>[0]`, which can hide option-type drift. Inspect runtime results and snapshot changes rather than relying on TypeScript alone.
- Check call-order documentation in `packages/tui/src/key-routes/key-route-composer.ts` and `packages/tui/src/key-routes/key-route-pointer.ts` before changing replay behavior.
- Before deleting or moving leak-pin `describe` blocks, inspect the `UNSWEPT` ownership map in `packages/tui/tests/leaked-mouse-input-sweep.test.tsx`; its exclusions encode fixture ownership through references that call graphs may miss.
- Treat `packages/tui/src/components/status-bar.tsx` as a facade. Locate helper behavior in its defining siblings and treat removal of facade exports as breaking.
- Treat `packages/tui/src/theme.ts` as a mutable singleton updated by `setActiveTheme()`, not as React context. For preset changes, inspect `theme-presets.ts`, `theme-types.ts`, and `theme-utils.ts`, then preserve preset parity with `THEME_PRESET_IDS` from `@wrongstack/core/types`.
- Treat `packages/tui/tests/theme-contrast.test.ts` as calibrated measurement coverage; remeasure contrast floors and luminance ordering rather than adjusting expectations casually.

## WebUI Boundaries and i18n

- `packages/webui/src/components/ChatView.tsx` re-exports `ChatView/index.tsx`, while `ChatInput.tsx` owns runtime pieces under `ChatInput/`; distinguish runtime imports from shared type-only dependencies.
- For routable components, inspect `packages/webui/src/components/view-registry.ts` and `components/index.ts`. Feature-directory leaves and ChatInput submodules do not necessarily require registry entries.
- The store barrel is `packages/webui/src/stores/index.ts`, commonly imported as `@/stores`; runtime behavior lives in sibling store files.
- Browser imports of core can resolve through `packages/webui/src/lib/core-browser-shim.ts`. Trace subpaths such as `@wrongstack/core/kernel`, `@wrongstack/core/coordination`, and `@wrongstack/core/types` separately.
- `packages/webui/tests/lib/session-scoped-send-stamping.test.ts` textually checks webui source. For send-site edits, search `session-stamping: stamped-at-helper` and `session-stamping: deliberately-unstamped`; call graphs cannot capture this contract.
- Start project-wide event-pattern investigations at `packages/webui-server/src/server/setup-events-pattern-handlers.ts` and distinguish `projectWide()` from `sessionPayload()`.
- `sessionPayload` in `packages/webui-server/src/server/connection-handler.ts` fills missing payload session IDs from the foreground session. Trace producer emit sites before proposing routing guards.
- Trace translations from `useAppTranslation()` in `packages/webui/src/i18n/index.ts`. Production catalogs load through `resourcesToBackend`, while `activity` and `settings` must remain deferred lazy namespaces.
- Inspect `packages/webui/tests/i18n/catalog-integrity.test.ts` for English key parity, nonblank values, and reference coverage, and `packages/webui/tests/i18n/deferred-namespaces.test.ts` for lazy loading. Search all JSON under `packages/webui` before declaring a key unresolved.
- Verify webui i18n changes with `cd packages/webui && npx vitest run tests/i18n`.

## Verification and Focused Lookup

- Derive test commands from package scripts and resolved Vitest configurations. Enumerate candidate test names before mapping coverage because filenames alone can omit relevant cases.
- Root Vitest excludes `packages/webui/**`. Use `cd packages/webui && npx vitest run <file>` or package scripts; webui server tests use the node project, while other webui suites use `browser-jsdom`.
- Run `packages/cli/tests/hq-dashboard.test.ts` with `pnpm --filter @wrongstack/cli test:hqdash`; ordinary CLI test commands may omit it.
- Check `packages/tools/tests/kanban-worklist-integration.test.ts` for cross-package worklist and session-routing coverage. Its real `handleWorklistMessage` and `mkSandbox()` from `packages/tools/tests/fixtures.js` form an established integration pattern.
- Before claiming a `CallType` is missing, read `packages/tools/src/codebase-index/schema.ts`; `type_ref` is emitted by `ts-parser.ts`, not the tree-sitter rule tables.
- For `<providerId> HTTP <status>` errors, inspect `parseProviderHttpError()` in `packages/providers/src/error-parse.ts`, `classifyProviderError()` in `packages/core/src/types/provider.ts`, and `ProviderError.body`; do not classify every 403 as an authentication failure.