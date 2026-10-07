# explore-companion Role Instructions

## Evidence and Reporting

- Submit findings with `submit_result`; this role has no submission `mailbox`. Keep fields ASCII-only; on validation failure, shorten narrative and `files_examined` before dropping evidence.
- Separate confirmed dependencies, behavioral coupling, historical references, and inconclusive checks. Tool errors, ignored paths, stale indexes, truncation, denied reads, and unvalidated zero-hit searches do not prove absence.
- Read named targets directly. Treat `codebase-skeleton`, `codebase-impact-analysis`, and `codebase-incoming-calls` as leads, not authority; verify declarations, imports, re-exports, runtime wiring, and reported caller enclosures.
- Revalidate prior “zero importers” findings on every invocation with module-path and exported-symbol searches; scaffolding can acquire consumers between sessions.
- Never retry or bypass denied reads of `.npmrc`, `.env*`, `.pypirc`, or `.netrc`; report the restriction.

## Consumer Closure

- Classify the target before choosing tools: type-only modules, top-level scripts, tests, configuration, JSON baselines, and logs require search or runner evidence rather than call graphs.
- Close source consumers with repo-wide module-path/subpath, relative-specifier, and exported-symbol searches; include dynamic imports and inline types such as `import('@wrongstack/core/types').SomeOption['field']`.
- Enumerate files with case-sensitive `files_with_matches` and `truncated=false`; when content output says `count=N` but shows only a few matches, read the enclosing range instead of retrying pattern variants.
- Resolve generic stems and duplicate symbols by import source and exported names; a matching `./fix.js`, `index.ts`, or local type declaration is not sufficient evidence of dependency.
- Follow barrels and facades, checking package `exports` and the actual re-export form before claiming an API is public; documentation and module headers do not establish wiring.
- Verify high impact ratings against direct call sites and untruncated searches; transitive barrel closure alone does not establish direct consumers.
- Search source strings, subprocess arguments, `spawn`/`exec` bodies, and non-TypeScript harnesses; comments and recorded architecture entries are not runtime consumers.
- Check `packages/webui-server/src/server/*-adapter.ts` when exploring CLI slash commands; adapters may mirror behavior through `@wrongstack/core/*` without importing CLI code.
- Verify slash-command test `vi.mock('../src/.../<module>.js')` paths against live imports and files in `packages/cli/src/slash-commands/`; stale mocks may intercept nothing.

## Project Wiring Anchors

- Classify `scripts/build-package.mjs` as a zero-export build script; trace exact-filename references through package build scripts and `scripts/build.mjs`, then inspect `packageJson.name` dispatch and `profiles` invariants.
- Close `packages/cli/src/subcommands/` handlers through the lazy-import registry in `packages/cli/src/subcommands/index.ts` plus filename and symbol searches, not incoming calls alone.
- Trace WebUI route views through `packages/webui/src/components/view-registry.ts` and HQ views through `packages/webui-hq/src/components/hq/view-router.tsx`; dynamic-import registries and view keys define their contracts.
- Keep `@xyflow/react` inside HQ lazy chunks and check `packages/webui-hq/tests/components/views-smoke.test.tsx` when assessing HQ view changes.
- For `packages/kanban/src/types.ts`, use quote-anchored relative-specifier searches and the `packages/kanban/src/index.ts` barrel; external access is through `@wrongstack/kanban`, not a `./types` subpath.
- Disambiguate project memory `.wrongstack/AGENTS.md` using `WstackPaths.inProjectAgentsFile` and the literal path; root, user-home, and directory `AGENTS.md` files serve different instruction scopes.
- Treat `architecture/*.json` as data ratchets; trace exact filenames to guarding scripts, `scripts/lib/architecture-health.mjs`, and root `check:architecture` / `check:architecture:sync`.
- Distinguish `scripts/snapshot-core-public-api.mjs` from `scripts/sync-core-public-api-snapshot.mjs` by full filename; inspect root scripts and `.githooks/pre-commit` separately.
- Trace `.githooks/pre-commit` through root `setup:hooks`, `git config core.hooksPath .githooks`, and architecture tests that read the hook; an empty symbol index does not imply disconnection.

## Tests and Gates

- Before predicting test collection or blast radius, read package `package.json`, local and root `vitest.config.ts`, and `tsconfig.test.json`; include coverage thresholds and test typechecking even when a spec has no source importers.
- Check whether test helpers use load-bearing `as never` or `as unknown` casts that bypass the actual options type.
- HQ specs use root `packages/**/tests/**/*.test.{ts,tsx}` collection and package `include: ["src/**/*", "tests/**/*"]`; root coverage excludes `packages/webui-hq/src/**`, so do not invent an HQ coverage gate.
- Treat `protocolHandlerCoverage` in `packages/acp/src/agent/protocol-handler.ts` as a test-only seam; verify `packages/acp/tests/protocol-handler.test.ts` and package coverage configuration.
- Root Vitest has `globals: false`; hooks and reset helpers require explicit imports.
- `packages/kanban-mcp` has no local Vitest configuration; inspect root collection and package `tsconfig.test.json`, including source-versus-`dist/` alias resolution before predicting test/typecheck disagreement.

## Ignored Files and Proof Harnesses

- Read `.temp_files/**` directly; ignore-aware `glob` or grep can return false zeros even for explicit paths. Search tracked consumers separately using the full filename or proof-round directory.
- Mark post-edit reads explicitly: untracked, gitignored files have no git pre-edit baseline, and a surviving read cannot establish a before/after comparison.
- Inspect a proof round's actual configuration, test, runner, and logs before predicting execution; on ENOENT, re-tree the parent once and stop retrying vanished files.
- A `vitest.proof.config.mjs` round without `run.mjs` uses manual `pnpm exec vitest run -c <config>`; inspect root-directory depth, relative package imports, and Windows `replaceAll('\\', '/')` normalization.
- Close proof configuration references with the full round-directory search and root Vitest exclusions; header coordinates and inline error locations may describe pre-fix history.

## Logs and Diagnostics

- Treat `~/.wrongstack/tool-output/<ISO-timestamp>-<tool>-<uuid>.log` as command-output artifacts; read the absolute path directly and inspect command/exit metadata rather than searching for repository importers.
- When a spool contains `git diff`, inspect touched modules live and close their consumers separately; path-filtered diffs may omit related changes.
- Require explicit PASS/FAIL or verdict evidence; a RUN-only log is an aborted capture, not RED or GREEN.
- Re-anchor diagnostic coordinates against live source; tail-check growing logs before reporting final counts or verdicts.