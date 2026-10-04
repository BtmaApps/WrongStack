# explore-companion Role Instructions

## Evidence and Result Submission

- Submit findings with `submit_result`; this role has no `mailbox`. Keep fields ASCII-only. If validation fails, shorten narrative and `files_examined` before removing evidence.
- Separate confirmed findings from inconclusive checks. Tool failure, ignored paths, index gaps, truncation, and unvalidated zero-hit searches never prove absence.
- Read named targets directly; confirm declarations, imports, assertions, and wiring rather than treating skeletons or call graphs as authoritative. Recheck volatile targets before submission.
- Never retry or bypass denied reads of `.npmrc`, `.env*`, `.pypirc`, or `.netrc`, including through `codebase-skeleton`; report the restriction and leave access to the leader.

## Search and Consumer Closure

- Use case-sensitive `grep`, `files_with_matches`, and `truncated=false` for candidate enumeration; read hits to distinguish consumers from comments, fixtures, generated output, and naming collisions.
- Close module consumers with module-path, sibling-relative, and bare-symbol searches plus barrel and `package.json` `exports` inspection; neither path searches nor `codebase-incoming-calls` alone establish completeness.
- Include dynamic imports and non-TypeScript harnesses: `from`-only patterns miss `import()`, while `.{ts,tsx}` sweeps miss browser-smoke `.mjs` source strings.
- Treat same-named symbols and huge indirect impact lists as collision candidates; verify direct call sites and import resolution before reporting blast radius.
- Content searches do not search filenames. State spelling and directory scope; full-path searches miss bare-filename references. Confirm unexpected zeros with simpler searches or direct reads.
- For non-code configs, expect `codebase-skeleton` to return full content; use literal-path searches rather than call graphs, distinguishing runtime readers, reverse references, sync comments, docs, and fixture data.
- Reuse complete `tree` logs under `~/.wrongstack/tool-output/` instead of repeating large walks; validate log searches with a known-present control token.

## Ignored Namespaces and Scratch Probes

- `.temp_files/`, `.design/`, `.reports/`, `docs/reports/`, and `docs/competitive-*/` can be absent from indexes, `glob`, and normal greps despite existing on disk; prove existence with direct reads or exact-directory trees.
- Prove tracked and ignored search scopes separately: use a known tracked token for the tracked control and a token from the target body for the ignored control. Explicit-path grep can still be filtered; if its control fails, discard that pass and read candidate files directly.
- Report which method establishes each zero. Ignored-file edits lack tracked Git recovery; warn the leader before blind edits.
- Classify scratch scripts and adjacent artifacts by content, not names; print-only probes are not assertion gates, and neighboring logs need not share a producer.
- For browser probes, inspect the manifest targeted by `createRequire(...)` and search hardcoded ports in both scratch and tracked package scopes; identify dependency and server prerequisites explicitly.
- For `proof-driven-bug-hunter` rounds, inspect the actual directory, config, runner, and test imports; aliases may be unused, and `config.ts` requires explicit `--config` rather than Vitest autodiscovery.
- `readDesignBrief()` in `packages/core/src/execution/design-detect.ts` injects the first 6000 bytes of `.design/` briefs into Design Studio prompts; edits affect agent constraints despite lacking normal test coverage.

## Package and Wiring Anchors

- Sandbox imports use `@wrongstack/core/sandbox`, not the `@wrongstack/core` barrel; validate package exposure through exports and re-exports.
- `packages/tools` consumers can use both `@wrongstack/tools` and declared subpaths such as `@wrongstack/tools/bash`; search both.
- Close `packages/kanban/src/verification/*` consumers through `verification-context.ts`, and WebUI handler consumers through `packages/webui/src/hooks/ws-handlers.ts`; check `architecture/test-only-exports.json` before calling unaggregated handlers production API.
- Separate `packages/webui/src/components/activity-bar/index.tsx` consumers from `activity-bar/nav.ts` consumers; the latter re-exports `@/lib/view-navigation`, not `ActivityBar`.
- Browser-smoke fakes are wired through Vite `resolve.alias` replacements; search filename stems and read `packages/simpleui/tests/app-browser-smoke.mjs`, not just import statements.
- pnpm 12 settings belong in `pnpm-workspace.yaml`; `.npmrc` still supplies npm-compatible registry/auth settings.
- Aliases available only through `scripts/vitest-core-aliases.mjs` do not establish public Node ESM paths; inspect manifests directly for alias targets and versions.

## Test Gates and Runtime Contracts

- Determine collectors from package scripts and root/package Vitest configs, not import graphs; check `architecture/test-skip-budget.json` before changing skip conditions.
- `packages/tools` and `packages/providers` use root Vitest; CLI tests are collected by both root and package configs, with package coverage thresholds and `tsconfig.test.json` typechecking.
- Root Vitest collects WebUI `tests/pure/**`, but excludes its component, hook, store, and other dedicated test directories; verify collection before claiming a gate.
- WebUI render tests are outside `packages/webui/tsconfig.json`; inspect imports, symbol mentions, `data-testid`, text, and class assertions because compiler checks will not catch contract changes.
- For test typechecking, inspect package scripts and `scripts/check-test-typecheck.mjs` discovery; `pnpm check:test-types` uses `architecture/test-typecheck-baseline/` ratchets.
- `packages/cli/tests/webui-server/ws-twoway-completeness.test.ts` scans source text, so import graphs miss its dependencies; new server frames require client handling or `INTENTIONALLY_UNHANDLED` classification.
- Status-bar edits require checking `packages/tui/vitest.status-bar-sgr.config.ts`, `packages/tui/tests/status-bar-sgr.test.ts`, and invocation scripts because raw escape-sequence assertions constrain colors and glyphs.

## Documentation and Inventory

- Treat `docs/specs/*-sdd.md` as traceability anchors with sibling `*.task-graph.json` synchronization; verify runtime readers separately.
- Check competitive-research baselines in `docs/reports/`, `docs/research/`, and `website/src/data/comparisons.ts` before reporting no prior art.
- Verify feature counts against `packages/plugins/src/catalog.ts`, `packages/core/tests/coordination/agent-catalog.test.ts`, and `packages/webui-server/src/server/config-pref-updates.ts`; prefer `docs/AGENTS.md` over generated `.wrongstack/AGENTS.md`.
- Distinguish root, in-project `.wrongstack/`, and user `~/.wrongstack/AGENTS.md`; trace `inProjectAgentsFile` and `project-instructions.ts` rather than assuming identical prompt consumers.