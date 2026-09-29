# explore-companion Role Instructions

## Result Submission

- Submit probe results through `submit_result`; this role does not have a `mailbox` send capability.
- Keep all `submit_result` fields ASCII-only. If validation fails, shorten combined text and multiline content; a compact set of findings with a concise `files_examined` list is more reliable than exhaustive prose.
- Separate confirmed findings from unavailable or inconclusive checks. An unavailable reference graph, missing index, failed glob, or zero grep hit is not evidence that a symbol has no consumers.
- Before describing pending edits, inspect the live working tree and `git diff HEAD`; todo state can lag behind actual edits. If a peer edited the file or no pre-edit baseline is available, say the findings reflect only post-edit state.

## Evidence and Search Discipline

- Read named files directly. Empty `glob` or `grep` results do not prove absence in gitignored, unindexed, snapshot, bundled, dist, or scratch directories.
- rg-backed `grep` and `glob` respect ignore rules and may silently skip `.temp_files/`, `dist/`, and some `.wrongstack/` paths. When checking a known gitignored artifact, pass the exact file path as the grep `path`; a named-file `count=0` is authoritative, while a directory-scoped zero hit is non-evidence.
- Grep content mode caps displayed matches at 3 per file. To enumerate exhaustively, split patterns into letter or path buckets, re-grep precise call-site patterns such as `funcName\(` or `symbol():`, or read the file in offset/limit chunks.
- If a chunked `read` of a large file elides the middle to a `tool-output/*.log` artifact, the artifact holds the full text. Grep or read that artifact path directly instead of repeatedly re-reading the project file.
- Avoid nested-quantifier regexes in `grep`, such as `from ['"]\.{1,2}(/[^'"]*)*/snapshot`; they may be rejected as catastrophic-backtracking risks. Use flat bounded patterns or a bare path substring instead.
- Treat `truncated=true` as incomplete output and validate any zero-hit search against a known positive before trusting it.
- Do not use brace-expansion glob patterns such as `packages/**/*.{ts,tsx}`; use separate single-pattern globs per suffix.
- If `codebase-skeleton` `stats.originalLines` and a same-batch `read` `total_lines` differ, treat the file as concurrently edited: re-read the affected tail and discard stale `file:line` anchors.
- Use `codebase-incoming-calls` as corroboration, not sole proof. It can be noisy, capped, or structurally blind to barrel-mediated consumers, dynamic imports, unindexed scratch files, generic default exports, and name collisions.
- If indexing fails with `Index build failed: Project files changed during indexing`, fall back to exact-text searches instead of rebuilding repeatedly.
- For vague probe symbols, search a distinctive phrase from the supplied context before broad source symbols; do not map common words like error names to unrelated implementations.

## Consumer, Barrel, and Name-Collision Mapping

- Combine searches for exact module specifiers, exported symbols, basenames, barrels, package subpath exports, aliases, dynamic imports, type-only imports, filesystem reads, and string or comment references before declaring a module or export unused.
- Resolve relative imports from the target module’s directory and search both extensionless and `.js` forms. Exclude unrelated same-basename modules.
- For barrel re-exports, pair a specifier grep with a symbol grep or `codebase-incoming-calls` on the exported symbols. Barrel-mediated importers are invisible to specifier-only searches.
- To prove a directory-index barrel has no consumers, run two flat greps: the explicit index specifier, e.g. `dir/index(\.js)?['"]`, and a directory-style import, e.g. `from ['"][^'"]*dir['"]`. One zero-hit grep alone is non-evidence.
- For a “who imports X.ts” probe on a re-exported module, search the leaf specifier, the barrel specifier, and the exported function names separately.
- For `packages/core/src/utils/*` modules, check `architecture/core-public-api-snapshot.json` for the barrel export pin and `.wrongstack/atlas/manifest.json` for the content-hash pin. Export-signature edits may drift both, and the snapshot can be stale relative to the live module. Establish real consumers with a `packages/`-scoped module-specifier grep plus the barrel line, not `codebase-incoming-calls` alone.
- Cross-check any “sole importer” claim from a repo-wide grep against a scoped re-grep under the package’s `tests/` directory and `codebase-incoming-calls` before reporting it; test files and capture caps can hide real importers.
- For DI-bound classes, pair `codebase-incoming-calls` with an exact-text grep for `new <ClassName>` across `packages/*/src/**` to isolate production instantiation sites, and a deep-specifier grep to separate direct deep-importers from barrel-mediated transitive consumers.
- For plugins whose sole export is the generic default `plugin`, skip `codebase-incoming-calls` for consumer proof because name collisions flood the graph. Grep the plugin id scoped to `packages/plugins/src`, then grep the named re-export used by barrels. Use one `codebase-incoming-calls` pass only to surface dynamic `import('../src/${name}/index.ts')` loops that literal specifier greps cannot match.
- Classify non-importer hits separately: `.wrongstack/atlas/manifest.json` entries are content-hash pins, `docs/reports/architecture-health-current.json` entries are report listings, and comments/docs are name mentions none of which are consumers.
- Known collision traps:
  - `resolveContainedPath` in `packages/core/src/session-catalog/store-summary.ts` is a local function, not a consumer of `packages/core/src/utils/path-segment.ts`.
  - `PendingRequest` in ACP is rooted in `acp-request-state`; same-named local interfaces appear elsewhere and conflate reference graphs.
  - `packages/tools/src/project-kit/schema.ts` can be confused with `packages/tools/src/codebase-index/schema.ts`; search the target directory first and corroborate with an absolute substring.
  - `Action`, `State`, `create`, and similar generic names require module-qualified searches.

## Vitest, Coverage, and Test Blast Radius

- Derive test commands from `package.json` scripts and resolved Vitest configurations. Read package configs directly; do not infer runs from reference graphs.
- Packages without their own `vitest.config.ts`, such as `packages/tools`, are gated by the ROOT `vitest.config.ts` include glob `packages/**/tests/**/*.test.{ts,tsx}`. Run their tests from repo root with `npx vitest run packages/<pkg>/tests/<file>.test.ts`, not by `cd`-ing into the package.
- Root coverage thresholds with `perFile: false` are aggregate and do not create per-file coverage gates.
- For a probe on `packages/<pkg>/vitest.config.ts`, do not use `codebase-incoming-calls`; these configs export only a default `defineConfig` and report `symbolCount: 0`. Establish callers with the package’s `test` script plus an exact-filename grep.
- Classify hits in `packages/core/tests/architecture/*` and `architecture/*.json` as negative-contract pins when they assert the config is not counted as an importer, rather than treating them as importers.
- Report a package config’s `thresholds` block verbatim. In this repo, package thresholds routinely make every coverage-bearing suite under them package-gate-moving.
- For `packages/acp`, always read the live `packages/acp/vitest.config.ts` thresholds before describing the gate as 100% or near-100%. Older notes claiming 100/100/100/100 on `src/**` can be stale; report the actual thresholds, including any deliberately unreached branches.
- These ACP suites are package-gate-moving coverage carriers:
  - `packages/acp/tests/acp-session.test.ts`
  - `packages/acp/tests/protocol-handler.test.ts`
  - `packages/acp/tests/server-agent-turn-delivery-notice.test.ts`
  - `packages/acp/tests/terminal-server-coverage.test.ts`
- `acp-session.test.ts` invariants:
  - Preserve pinned message and error anchors such as `'session/new returned no session id'`, `acp_session.late_cancel_failed`, and error kinds `closed`, `unsupported_capability`, `prompt_failed`, and `protocol_error`.
  - The `vi.mock` factory must keep `class ClientTransport` syntax because the source `new`s it.
  - `startSession()` must answer `initialize` before awaiting `ACPSession.start()` to avoid deadlock.
  - `afterEach` should keep the 3-retry `fsp.rm` behavior for Windows EBUSY.
  - Run with `cd packages/acp && npx vitest run tests/acp-session.test.ts`.
- Shared ACP mock helpers under `packages/acp/tests/helpers/` are contract carriers. Preserve:
  - the named export both `vi.mock` factories destructure,
  - loadability by dynamic `await import()` inside the factory, because static imports are hoisted wrongly,
  - instance-field `vi.fn()` members so each constructed transport gets fresh mocks.
- `protocol-handler.test.ts` is the sole consumer of the `protocolHandlerCoverage` seam in `packages/acp/src/agent/protocol-handler.ts`. Deleting or weakening it can fail the ACP package gate. Run with `cd packages/acp && npx vitest run tests/protocol-handler.test.ts`.
- `server-agent-turn-delivery-notice.test.ts` is the sole coverage suite for the background-delegation delivery notifier in `packages/acp/src/agent/server-agent-turn.ts`. Preserve pinned strings, Windows path normalization checks, optional-`sendSessionUpdate` `RunTurnApi` shape, and debounce/settle margins. Run with `cd packages/acp && npx vitest run tests/server-agent-turn-delivery-notice.test.ts`.
- To map a test file’s blast radius in a coverage-gated package, grep assertion anchors, event names, warning strings, and notice literals across the package’s `tests/` directory rather than trusting imports alone.
- Flag test-local copies of non-exported production constants as silent drift points when production changes the constant.
- Search a test’s exact filename separately from its production module stem. Classify metadata, documentation, report listings, `import type`, and value imports separately.
- To map behavior exercised by a test, trace the production symbols it imports. To map references to the test itself, search the full test filename.
- Read external Vitest snapshots directly from `packages/<pkg>/tests/__snapshots__/<test>.snap`; snapshot keys can be part of the behavioral contract.

## ACP Probe Contracts

- Start ACP trust-boundary probes at `packages/acp/src/client/trust-boundary-permission.ts`. The production wiring point is the `ACPSession` constructor in `packages/acp/src/client/acp-session.ts`.
- `opts.permissionPolicy` and `opts.trustBoundary` are mutually exclusive; supplying both throws a `TypeError`.
- The effective permission fallback order is: `trustBoundary` policy, then `opts.permissionPolicy`, then `readOnlyPermissionPolicy`.
- `packages/acp/src/client/index.ts` and `packages/acp/src/index.ts` re-export only public options and helpers such as `ACPTrustBoundaryAdapterOptions`, `makeTrustBoundaryPermissionPolicy`, and `toTrustBoundaryRequest`. They intentionally omit the `trustBoundaryPermissionCoverage` test seam; consumers needing that seam import `packages/acp/src/client/trust-boundary-permission.ts` directly.
- The ACP terminal chain is fixed:
  - `TerminalServer` lives in `packages/acp/src/client/terminal-server.ts`.
  - `ACPSession` is the only production constructor site.
  - Dispatch goes through `handleAcpTerminalRequest` in `packages/acp/src/client/acp-session-callbacks.ts`.
  - The package barrel re-exports terminal APIs from `packages/acp/src/index.ts`.
  - `TerminalServer` has no importers outside `packages/acp`, and its dedicated coverage seam is `packages/acp/tests/terminal-server-coverage.test.ts`.

## Proof-Driven Bug Hunter and Scratch Artifacts

- A `.temp_files/proof-driven-bug-hunter/<date>-<slug>/` round is run by its sibling `vitest.proof.config.mjs`. Its `test.include` pins the proof file, while `coreAliases` and `@wrongstack/plugin-sdk` aliases force source resolution.
- Run proof tests from repo root with `npx vitest run --config <sibling config path>`.
- Prove zero-gate impact by citing the ROOT `vitest.config.ts` exclude for `**/.temp_files/**`, not by absence of grep hits.
- Validate the sibling config’s `repoRoot` against round depth: `.temp_files/proof-driven-bug-hunter/<round>` is three levels deep, so exactly three `'..'` walk-ups land on repo root.
- Treat `test.include` as cwd-relative when the proof config does not set `root`.
- Always check for a stale root-level `vitest.proof.config.mjs` before giving a proof-run command. A stale root config can target an older round and compute `repoRoot` outside the repo.
- Treat ENOENT on a proof-round target as expected successful teardown, not a lost file. Confirm with:
  - direct `read` returning ENOENT,
  - parent tree showing an empty/shared parent,
  - a shallow `.temp_files` tree ruling out same-slug relocation.
  Then report the durable successor in `packages/<pkg>/tests/`.
- In proof `test.ts` files, separate bug cases from controls. Check platform gates such as `it.runIf(isWin)`; a proof that is green off-platform may have skipped every test.
- Read the sibling `red.log` against the actual assertion that failed. In a bundled `it` containing victim and controls, the failing assertion can differ from the comment-labeled victim, and the proof’s `FAIL:` message can overstate the defect mode.
- For `.temp_files/**/*.mjs` scratch scripts that parse failing subprocess output, remember that `execFileSync` throws on non-zero exit. For `npx tsc --noEmit`, type errors exit 2; unless the script catches the error and reads `err.stdout`, the parse path is unreachable.
- Code-index tools do not cover `.temp_files/`. Read scratch files in full and derive dependencies from imports, `require()`, `process.argv`, filesystem paths, embedded source strings, selectors, stubbed APIs, and hardcoded targets.
- Search exact scratch filenames across repository scripts, manifests, and documentation to identify invokers. With no repository references, classify the script as manual-run only, not as a repository gate.
- Before warning that a scratch codemod may re-run, inspect write targets, backup ordering, guards, consumed anchors, generated artifacts, and whether replacements are self-preserving. A `BACKUP` written before the first guard can overwrite the original even when the target remains unchanged.
- Treat `.wrongstack/tool-output/` files as captured logs, not source. If `codebase-skeleton` returns `symbolCount: 0`, classify the file as a log artifact using the filename pattern `<timestamp>-<toolname>-<uuid>.log` and summarize its record lines rather than running import graphs.

## Known Drift Surfaces and Project Facts

- `packages/core/src/utils/path-segment.ts` is barrel-re-exported from `packages/core/src/utils/index.ts` and pinned in `architecture/core-public-api-snapshot.json`.
  - Production consumers include `packages/acp/src/agent/session-store.ts` and `packages/webui-server/src/server/http-server/security-helpers.ts`.
  - `packages/cli/src/hq-server/utils.ts` is a hand-synced mirror, not a pure consumer. It imports only `isSafeSessionId` but re-implements `isSafePathSegment` and `MAX_PATH_SEGMENT_LENGTH` locally.
  - The CLI copy can miss core’s Windows reserved-name check (`WINDOWS_RESERVED_NAMES_RE`, `con`, `nul`, `com1-9`, `lpt1-9`) and `typeof !== 'string'` guard, so rule changes in core can silently diverge the CLI layer.
  - `packages/cli/tests/hq-path-segment.test.ts` imports the CLI-local copies, not core’s.
- `packages/core/src/security/yolo-risk.ts` has hand-synced logic mirrors that import graphs cannot see:
  - `packages/webui/src/components/SettingsPanel/YoloConfirmList.tsx` mirrors `ALL_DESTRUCTIVE_KINDS`.
  - `packages/tools/src/_danger-detect.ts` mirrors download-and-run danger patterns.
  - `packages/cli/src/goal-commands.ts` mirrors the broader pattern set.
  - `permission-helpers.ts` imports `getInputString` from `yolo-risk.ts`, and `classifyShellSurfaceInput` is the sole production wrapper between the classifier and the permission policies.
- For `tsconfig.base.json`, map the `extends` set with a repo-wide grep for `tsconfig\.base\.json`; call graphs are inapplicable to JSON config.
  - Hand-synced mirrors duplicate base safety flags inline and silently miss strictness changes:
    - `packages/webui/tsconfig.json`
    - `packages/simpleui/tsconfig.json`
    - `packages/webui-hq/tsconfig.json`
  - Treat `packages/tools/src/typecheck.ts` hits as filename-discovery candidates, not option consumers.
- `packages/techstack/src/advisory/native-audit.ts` has a split export surface:
  - Public via `packages/techstack/src/index.ts`: `createAuditRunner`, `isNativeAuditAvailable`, `runNativeAudit`, `runNpmAudit`.
  - Test-only per-ecosystem runners pinned in `architecture/test-only-exports.json`: `runPipAudit`, `runCargoAudit`, `runGoVulncheck`, `runComposerAudit`, `runDotnetAudit`.
  - Its behavior blast radius includes convention tests that import nothing from it directly:
    - `packages/core/tests/architecture/spawn-convention.test.ts`
    - `packages/core/tests/architecture/nonblocking-io-hotpaths.test.ts`
    - `packages/tools/tests/architecture/shell-true-parity.test.ts`
- `packages/tools` kill-guard coverage is platform-sensitive:
  - The cross-platform suite is `packages/tools/tests/bash-kill-guard-targets.test.ts`; sibling parse/path suites can be Windows-skipping.
  - Its `getPersistentProcessRegistry` mock seam must remain a plain-function factory because the source calls it directly, not with `new`.
- In `packages/kanban/src/manager/`, distinguish the file barrel `manager/lifecycle.ts` from the directory barrel `manager/lifecycle/index.ts`. A substring grep for `manager/lifecycle` conflates both import forms.
  - `validateDoneEvidence` in `manager/lifecycle/definition-of-done.ts` is consumed only by `manager/lifecycle/task-transition.ts`, even when the file barrel makes it look public.
- Plugin production anchor sites are fixed under `packages/plugins/src`:
  - `generated-plugin-exports.ts`
  - `factories/index.ts`
  - `manifest/index.ts`
  - `audit/index.ts`
  Grep the plugin id scoped to `packages/plugins/src` first; repo-wide grep can truncate on docs, website, and atlas noise.

## Persistent Cross-Package Lookup Contracts

- Read `package.json`, `pnpm-workspace.yaml`, and package `exports` maps directly for scripts, subpath exports, workspace membership, and `link:` overrides. Manifests are not reliably represented in reference graphs.
- Treat top-level `packages/*/scripts/*.mjs` files as standalone, export-free CLI entry points. Prove that repository code does not call them with exact-filename greps across scripts, manifests, docs, and tests, then inspect `.temp_files/` for invocation artifacts. Do not use `codebase-incoming-calls` for argv-driven scratch scripts.
- For Markdown files, skip `codebase-skeleton` and read the file directly to preserve section structure. Find textual dependents with exact basename or path-stem searches; `codebase-incoming-calls` does not model Markdown imports.
- For `packages/webui` component boundaries:
  - Inspect `packages/webui/src/components/view-registry.ts` and `components/index.ts` for routable components.
  - `ChatView.tsx` re-exports `ChatView/index.tsx`, while `ChatInput.tsx` owns runtime pieces under `ChatInput/`.
  - The store barrel is `packages/webui/src/stores/index.ts`, commonly imported as `@/stores`.
  - Browser imports of core can resolve through `packages/webui/src/lib/core-browser-shim.ts`; trace subpaths separately.
- For WebUI i18n:
  - Trace translations from `useAppTranslation()` in `packages/webui/src/i18n/index.ts`.
  - Production catalogs load through `resourcesToBackend`; `activity` and `settings` must remain deferred lazy namespaces.
  - Check `packages/webui/tests/i18n/catalog-integrity.test.ts` and `packages/webui/tests/i18n/deferred-namespaces.test.ts`, and search all JSON under `packages/webui` before declaring a key unresolved.
  - Verify with `cd packages/webui && npx vitest run tests/i18n`.
- `packages/webui/tests/lib/session-scoped-send-stamping.test.ts` textually checks WebUI source. For send-site edits, search `session-stamping: stamped-at-helper` and `session-stamping: deliberately-unstamped`; call graphs cannot capture this contract.
- Start project-wide WebUI-server event investigations at `packages/webui-server/src/server/setup-events-pattern-handlers.ts` and distinguish `projectWide()` from `sessionPayload()`.
- `sessionPayload` in `packages/webui-server/src/server/connection-handler.ts` can fill missing payload session IDs from the foreground session. Trace producer emit sites before proposing routing guards.
- For project-kit fixtures:
  - Inventory `.wrongstack/project-kit/<kit>/fixtures/**` with an unlimited or deep `tree`; shallow trees can report `truncated=false` while pruning deeper files.
  - Classify fixture data files as either name-existence contracts, such as collision seeds, `.staged`/`.aged` markers, or occupancy pre-seeds, or content contracts whose bytes are pinned in `kit.json` `tests[].expected`.
  - Search `\.`-prefixed markers; a bare `aged` search also matches `.staged`, prose, and unrelated identifiers.
  - Treat `kit.json` `tests[]` and any “Known limits” documentation as the coverage contract. Fixture directories not referenced by declared tests are covered only by ad hoc probes unless another durable contract exists.
  - Disambiguate `runner.ts` by responsibility:
    - `packages/tools/src/project-kit/runner.ts` owns child-process IPC, `BOOTSTRAP`, `process.send`, and `runKitProcess`.
    - `packages/core/src/hooks/runner.ts` owns in-process `HookRunner` orchestration.
    - `packages/bench/src/runner.ts` owns subprocess benchmarking.
  - Compare filesystem roots with `fs.realpath`, not lexical `path.resolve`, so symlinks and Windows short names do not create false differences.
- For TUI contracts:
  - Treat `packages/tui/tests/key-handler-replay-corpus.test.ts` as the behavioral acceptance contract for `createAppKeyHandler`; its expected results are coupled to the snapshot file.
  - The replay corpus’s `makeHandler` options may use an `as never` cast that hides option-type drift; inspect runtime behavior and snapshot changes, not TypeScript alone.
  - Check call-order documentation in `packages/tui/src/key-routes/key-route-composer.ts` and `packages/tui/src/key-routes/key-route-pointer.ts` before changing replay behavior.
  - Before deleting or moving leak-pin `describe` blocks, inspect the `UNSWEPT` ownership map in `packages/tui/tests/leak-ping?` ownership map in `packages/tui/tests/leaked-mouse-input-sweep.test.tsx`; its exclusions encode fixture ownership that call graphs may miss.
  - Treat `packages/tui/src/components/status-bar.tsx` as a facade; removal of facade exports can be breaking even when the logic lives in sibling helpers.
  - Treat `packages/tui/src/theme.ts` as a mutable singleton updated by `setActiveTheme()`, not React context. For preset changes, inspect `theme-presets.ts`, `theme-types.ts`, and `theme-utils.ts`, and preserve parity with `THEME_PRESET_IDS` from `@wrongstack/core/types`.
  - Treat `packages/tui/tests/theme-contrast.test.ts` as calibrated measurement coverage; remeasure contrast floors and luminance ordering rather than adjusting expectations casually.
- For provider-ID probes:
  - Search the exact model or provider ID repository-wide before searching symbols, including hidden `.wrongstack/` provenance where relevant.
  - Cross-check `packages/providers/src/trusted-presets.ts`; absence from the relevant preset’s `models[]` can distinguish an unlisted config passthrough from a repository-defined model.
  - Resolve provider half of `providerId/model` through factory branches in `packages/providers/src/index.ts` and the provider module.
  - For waiting-room or skipped-provider probes, inspect `packages/core/src/core/provider-runner.ts` synthetic 429 preflight paths and `packages/core/src/coordination/provider-status-tracker.ts` recovery actions.
- For `<providerId> HTTP <status>` errors:
  - Inspect `parseProviderHttpError()` in `packages/providers/src/error-parse.ts`, `classifyProviderError()` in `packages/core/src/types/provider.ts`, and `ProviderError.body`.
  - Do not classify every 403 as an authentication failure.