# explore-companion Role Instructions

## Evidence and Reporting

- Submit findings with `submit_result`; this role has no submission `mailbox`. Keep fields ASCII-only; on validation failure, shorten narrative and `files_examined` before dropping evidence.
- Separate confirmed dependencies, behavioral coupling, historical references, and inconclusive checks. Tool errors, ignored paths, stale indexes, truncation, denied reads, and unvalidated zero-hit searches do not prove absence.
- Read named targets directly. Treat `codebase-skeleton`, `codebase-impact-analysis`, and `codebase-incoming-calls` as leads, not authority; verify declarations, imports, re-exports, runtime wiring, and reported caller enclosures.
- Revalidate prior "zero importers" findings on every invocation with module-path and exported-symbol searches; sessions live-edit this tree, so a first-round hit followed by zero is concurrent editing, not tool failure.
- Never retry or bypass denied reads of `.npmrc`, `.env*`, `.pypirc`, or `.netrc`; report the restriction.
- Report `files_with_matches` counts and read the enclosing ranges when content output is capped (~3 matches/file); grep alternation patterns over 256 chars fail with `VALIDATION_ERROR` — split symbol sets instead.
- When a probe quotes a todo item's wording verbatim, search `packages/core/skills/**/SKILL.md` first: matching the owning skill yields the acceptance contract, not just file locations.

## Consumer Closure

- Classify the target before choosing tools: type-only modules, top-level scripts, tests, configuration, JSON baselines, and logs require search or runner evidence rather than call graphs.
- Close source consumers with repo-wide module-path/subpath, relative-specifier, and exported-symbol searches; include dynamic `import('...')`/inline `type` expressions, which never appear in call graphs.
- Enumerate files with case-sensitive `files_with_matches` and `truncated=false`; when content output shows `count=N` but few matches, read the enclosing range instead of retrying pattern variants.
- Never use `codebase-incoming-calls` for hyper-generic symbols (`dispatch`, `run`, `options`) or barrel-mediated symbols — grep is authoritative here. Resolve duplicate symbols by import source (e.g. `packages/cli/src/hq-server/routes/session-handlers.ts` re-implements webui-server handlers with different signatures).
- Close multi-export modules with a grep per *exported symbol name*: a module can have many importers while an individual export is test-only or ratcheted (`architecture/test-only-exports.json`).
- Follow barrels and facades, checking `package.json` `exports` and the actual re-export form before claiming an API is public. A missing barrel and a non-re-exporting barrel have different closure consequences — glob the barrel, then grep it for zero hits. Note `export * from` makes new exports public automatically; named-list barrels do not.
- Search source strings, subprocess arguments, `spawn`/`exec` bodies, and non-TypeScript harnesses; comments and recorded architecture entries (glossary ratchets, KAT-provenance test comments, `docs/archive/**`) are documentation, not consumers.
- Classify literal hits into declaration (`package.json` deps), documentation comment, lockfile site, and code before reporting dependency removal. Dependency-removal provenance requires `pnpm-lock.yaml` `importers`/`packages`/`snapshots` entries plus a grep of human-readable brand names (`Radix Select`), since doc comments survive removal and point at nonexistent components.
- For testing blast radius, check env-var-driven test seams (`WRONGSTACK_*` vars read by a spawning daemon): a module may have zero static test importers yet be behaviorally ratcheted. Also grep distinctive assertion literals — if they match only the spec, that spec is the sole regression ratchet.
- Confirm package-manager state against **root** `pnpm-lock.yaml`/`pnpm-workspace.yaml`/`package.json` `packageManager` field; `packages/techstack/tests/fixtures/monorepo-pnpm/` hits are test-fixture decoys.

## Project Wiring Anchors

- `architecture/core-public-api-usage.json` records each source file's `@wrongstack/core/*` imports repo-wide — grep it for the target path before assessing edit risk; changes require root `check:architecture` / `check:architecture:sync`. Other `architecture/*.json` files are data ratchets too; trace filenames to guarding scripts and re-sync commands.
- `packages/webui-server/src/server/*-adapter.ts` modules may mirror behavior through `@wrongstack/core/*` without importing CLI code; close them by symbol-name grep plus barrel/facade reads, not `codebase-incoming-calls`. `goal-ws-handler-*.ts` siblings are contract-driven: `import type` sites and `Parameters<typeof useHook>[0]`/`ReturnType<typeof useHook>` seams break silently and never appear in call graphs.
- `packages/sage/src/project-server-*.ts` helpers bind to env-driven daemon behavior in tests — close with module-stem + exported-symbol greps plus a full barrel read before declaring internal-only.
- `packages/sdd` and `packages/telegram` symbols can appear in domain-glossary ratchets or as construction sites inside the plugin-entry barrel (`new PollLock(...)` inside `src/index.ts`) — these are not module consumers; check the barrel's re-export form for absence before using "public API" language.
- `packages/core/src/utils/atomic-write.ts`-style core modules are thin adapters (`createLockTimeoutError` bound to `FsError`) over `packages/persistence` primitives shared with `packages/kanban/src/utils/atomic-write.ts`; `packages/persistence/tests/adapter-conformance.test.ts` ratchets both adapters.
- `packages/providers/src/error-parse.ts` is widely imported, but individual exports (`retryAfterMsFromBody`) may have zero production callers — verify per symbol.
- Close `packages/cli/src/subcommands/` handlers through the lazy-import registry in `packages/cli/src/subcommands/index.ts` plus filename and symbol searches, not incoming calls alone.
- Trace WebUI route views through `packages/webui/src/components/view-registry.ts` and HQ views through `packages/webui-hq/src/components/hq/view-router.tsx`; dynamic-import registries and view keys define their contracts.
- Keep `@xyflow/react` inside HQ lazy chunks and check `packages/webui-hq/tests/components/views-smoke.test.tsx` when assessing HQ view changes.
- For `packages/kanban/src/types.ts`, use quote-anchored relative-specifier searches and the `packages/kanban/src/index.ts` barrel; external access is through `@wrongstack/kanban`, not a `./types` subpath.
- Disambiguate project memory `.wrongstack/AGENTS.md` using `WstackPaths.inProjectAgentsFile` and the literal path; root, user-home, and directory `AGENTS.md` files serve different instruction scopes.
- Distinguish `scripts/snapshot-core-public-api.mjs` from `scripts/sync-core-public-api-snapshot.mjs` by full filename; inspect root scripts and `.githooks/pre-commit` separately. Trace `.githooks/pre-commit` through root `setup:hooks`, `git config core.hooksPath .githooks`, and architecture tests that read the hook — an empty symbol index does not imply disconnection.
- Classify `scripts/build-package.mjs` as a zero-export build script; trace exact-filename references through package build scripts and `scripts/build.mjs`, then inspect `packageJson.name` dispatch and `profiles` invariants.
- Verify slash-command test `vi.mock('../src/.../<module>.js')` paths against live imports and files in `packages/cli/src/slash-commands/`; stale mocks may intercept nothing.

## Tests and Gates

- Before predicting test collection or blast radius, read package `package.json`, local and root `vitest.config.ts`, and `tsconfig.test.json`; include coverage thresholds and test typechecking even when a spec has no source importers.

_(truncated at 8192 bytes — the next optimization pass must shorten it)_