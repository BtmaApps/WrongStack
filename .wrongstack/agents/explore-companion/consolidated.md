# explore-companion Role Instructions

## Evidence and Reporting

- Use `codebase-skeleton`, `codebase-impact-analysis`, `codebase-incoming-calls`, and `codebase-search` for discovery; verify conclusions against source, imports, runtime wiring, configuration, and tests.
- Revalidate consumer and absence claims on every invocation. Concurrent edits, ignored paths, stale indexes, truncated output, and tool errors can invalidate findings.
- Treat zero hits as inconclusive until traversal is validated. Distinguish failed or inaccessible searches from genuinely absent files or consumers.
- Close exhaustive searches with `files_with_matches` or verified untruncated output. If reported counts exceed displayed matches despite `truncated=false`, use ranged reads or archived `~/.wrongstack/tool-output/*.log` output; preserve the exact log path.
- Separate runtime consumers, type-only consumers, behavioral coupling, configuration references, documentation, and generated metadata.
- Submit findings through `submit_result`, including `suggested_next_steps`; use an empty array when no follow-up is needed.
- Never retry or bypass denied reads of `.npmrc`, `.env*`, `.pypirc`, or `.netrc`; report the restriction.

## Task Orientation

- Resolve task-named files using exact filenames, literal stems, labels, or distinctive runtime strings before mapping impact.
- For vague tasks without file hints, inspect an mtime-descending `glob` over `packages/**/src/**` and `packages/**/tests/**`, then examine candidate clusters with `codebase-skeleton`.
- Read the owning `packages/core/skills/**/SKILL.md` when acceptance wording matters.
- Classify targets as modules, suites, scripts, configurations, baselines, generated artifacts, or data before selecting analysis tools.

## Consumer and Public-API Closure

- Read exact exported names before incoming-call analysis; pair graph results with module-specifier and per-export searches, including sibling tests.
- Match complete import specifiers rather than bare filename prefixes; cover relative paths, aliases, barrels, multiline imports, dynamic `import()`, `require()`, mocks, and non-TypeScript harnesses.
- Content searches do not match filenames automatically; reconcile importer results against actual import specifiers, not the target module's presence in results.
- Read match context to distinguish executable calls from comments, template-generated source, duplicate names, and metadata.
- Inspect actual re-exports and `package.json` `exports` before claiming public availability; resolve facade symbols rather than assuming the importing file defines them.
- Search type-only exports and `ReturnType<typeof hook>` aliases separately; runtime call graphs omit these consumers.
- Trace behavioral seams beyond imports: rendered CSS selectors, environment variables, subprocess arguments, runtime strings, snapshots, and assertions.
- Read caller wrappers around reducers and state models to identify filtering, ownership checks, and post-processing.
- Treat `codebase-impact-analysis` results with `totalCallSites=0`, `symbolFound=true`, and huge unrelated `line:0` closures as noise; verify exact exports and barrel imports directly.

### Per-Module Consumer Anchors

- **`packages/sage/src/sqlite-store-counters.ts`**: grep exported symbol names repo-wide, not just the `.js` specifier — references also live in comments (`store-helpers.ts`, `sqlite-store-schema.ts`), archived design docs (`docs/archive/plans/sage-phase4-design.md`, `docs/archive/reports/research/sage-memory-investigation.md`), and test headers (`packages/sage/tests/store-helpers-counter-merge.test.ts`); the only real importer is `sqlite-memory-mutations.ts` via `recordInjection`/`recordUse` wrapped in `runCounterMutation`. Preserve the invariant that counters never advance `updated_at`.
- **`packages/tui/src/hooks/*`**: grep exported symbol name **and its returned product names** repo-wide — app.tsx decomposition threads hook products (e.g. `runEternalLoopRef`/`runParallelLoopRef` from `use-autonomy-drivers.ts`) through the `use-app-environment.ts` facade and re-aliases them as `S['refs']['eternalLoop']`/`parallelLoop` spine keys in `use-app-pipeline-builders.ts`; downstream consumers (`submit-controller.ts`, `submit-slash-command.ts`) never import the producing hook, so module-specifier grep alone undercounts blast radius.
- **`packages/core/src/coordination/mailbox-*`**: grep exported symbol names **plus** the `@wrongstack/core/coordination` subpath specifier — `packages/cli` files (e.g. `hq-server/mailbox-gateway-manager.ts`) import via the `mailbox-exports.ts` barrel re-export through that subpath. Module-specifier greps through the facade (`mailbox-types.ts`, `mailbox-codecs.js`) find only facade importers; symbol-name greps find real consumers. Suffix-colliding pairs like `acceptMailboxMessageForSession`/`...Sync` need separate exact greps. Check `architecture/core-public-api-snapshot.json` for each symbol — 0 hits = package-internal, no snapshot gate.
- **`packages/cli/src/cli-main-helpers.ts`**: repo-wide grep of the bare module name — despite the filename, `cli-main.ts` is **not** an importer; production consumers are only `src/wiring/*` plus `cli-infrastructure.ts`, plus two `vi.mock` shape couplings in `tests/cli-infrastructure.test.ts` and `tests/zero-statement-cli-modules.test.ts`. Treat `governanceRuntimeEnabled`, `governedHandle`, and `WRONGSTACK_GOVERNANCE_ENV` as test-only exports; `bootstrapCliGovernance` is production-reachable only through `setupCliGovernance` within the same file. Expect a parallel duplicate of `WRONGSTACK_GOVERNANCE_ENV` in `packages/webui-server/src/server/governance-runtime.ts`.
- **`packages/cli/src/wiring/vector-memory-setup.ts`**: grep exported symbol names (`setupVectorMemory`, `DEFAULT_VECTOR_WEIGHT`, `VectorMemoryTuning`) — `setupVectorMemory` near-collides with webui-server's `setupVectorMemoryMirror` (`packages/webui-server/src/server/start-webui-vector.ts`); `DEFAULT_VECTOR_WEIGHT = 0.3` is independently re-declared in `packages/sage/src/retrieval/vector-augment.ts` and `packages/vector-memory/src/sage-fusion.ts`; `packages/cli/tests/wiring-teardown-registrar.test.ts` enforces the LIFO teardown ordering contract with zero import link.
- **`packages/cli/src/wiring/session-registry.ts`**: three unrelated `session-registry` modules exist — also `packages/core/src/session-catalog/session-registry.ts` (`SessionRegistry`/`LegacySessionRegistry` via `packages/core/src/storage/index.ts`) and `packages/webui-server/src/server/collab/session-registry.ts` (`CollabSessionRegistry`). Close CLI consumers with `wiring/session-registry(\.js)?` specifier + `setupSessionRegistry`/`SessionIdentityTarget` symbol greps; treat `packages/webui-server/src/server/standalone-session-identity.ts`'s same-name `SessionIdentityTarget` as a separate twin.
- **`packages/cli/src/boot.ts`**: three same-name `boot.ts` modules exist — also `packages/core/src/boot.ts` (`bootConfig`, `flagsToConfigPatch`, `assertProjectRootOutsideStateDir`, `cleanupStaleProjects`) and `packages/webui-server/src/server/boot.ts` (`bootConfig`, `patchConfig`). Close real consumers with a package-scoped specifier grep (`packages/cli/src/**` for `['"][^'']*\bboot(\.js)?["']`); treat `codebase-incoming-calls` hits on symbol `boot` as noise when the caller file lacks that import — `packages/cli/src/cli-main.ts` declares `const boot = await bootCliRuntime(...)`.
- **`apps/desktop/src/main/runtime-manager.ts`**: treat as a re-export facade for `runtime-manager-state.js`, `runtime-manager-paths.js`, `runtime-process.js`, `runtime-project-manifest.js`. Close with `runtime-manager(\.js)?` module-specifier grep (covering `from`/`import()`/`require`) plus `new\s+DesktopRuntimeManager\s*\(` for construction sites; sibling module specifiers undercount.

_(truncated at 8192 bytes — the next optimization pass must shorten it)_