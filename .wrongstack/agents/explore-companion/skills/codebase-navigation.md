## Consumer closure

- For CLI slash commands, check `packages/webui-server/src/server/*-adapter.ts` for behavioral mirrors, not importers: `goal-refiner-adapter.ts` uses `refineGoalWithProvider` from `@wrongstack/core/goal` directly rather than importing `goal-refiner.ts`.
- For interface-only core modules such as `packages/core/src/types/one-shot-llm.ts`, skip `codebase-incoming-calls`; grep exported symbols and the file stem repo-wide. Include inline types such as `import('@wrongstack/core/types').SomeOption['field']`.
- Disambiguate generic relative specifiers (`from './fix.js'`) and same-named types (`RefineFailureDecision`) by imported symbols **and source module**. Do not count sibling implementations as dependencies.
- Recheck module-path tokens and exported-symbol alternations on every visit; never reuse “zero importers” findings or trust header wiring claims. Verify `packages/core/src/execution/refine-decisions.ts` against `packages/core/src/execution/index.ts`, package exports, and `scripts/build-package.mjs`. Treat `codebase-impact-analysis` HIGH ratings with `totalCallSites=0` as unproven; confirm direct edges.
- For CLI handlers, grep filename stems and verify imports in `packages/cli/src/subcommands/index.ts`; lazy `async () => (await import('./handlers/<name>.js')).<name>Cmd` wiring escapes call graphs.
- For `.wrongstack/AGENTS.md`, use untruncated `grep inProjectAgentsFile` plus `grep '\.wrongstack/AGENTS\.md'` in `packages/core/src` and `packages/cli/src`; bare `AGENTS\.md` conflates project, repository, user, and directory instructions.

## Scripts and ratchets

- Classify `scripts/build-package.mjs` as zero-export top-level code. Find consumers through exact-filename searches in `package.json` `build` scripts, `scripts/build.mjs`, and architecture tests—not `codebase-incoming-calls`. Inspect `packageJson.name` dispatch through `profiles`; preserve `splitting: true` for `@wrongstack/core`/`@wrongstack/tools`, dist-path entry keys, and TUI React bundling.
- Treat `architecture/*.json` as data ratchets: grep exact filenames with `truncated=false`; trace `loadArchitectureInputs` in `scripts/lib/architecture-health.mjs`, producers’ `--write`, and root `check:architecture` / `check:architecture:sync`. Distinguish `scripts/snapshot-core-public-api.mjs` from `.githooks/pre-commit`’s `scripts/sync-core-public-api-snapshot.mjs`.

## Verification pitfalls

- Read implausibly attributed constructor sites before naming callers; `codebase-incoming-calls` can mislabel `FileSessionWriter` wiring as `recordSideEffect`.
- Include actual `coverage.thresholds` and `tsconfig.test.json` gates for tests. For webui-hq, inspect root `vitest.config.ts`: `packages/webui-hq/src/**` is coverage-excluded; do not invent a package coverage gate.
- Under `.temp_files/`, use direct `read`, not ignore-sensitive `glob`; search tracked consumers by full filename. Label post-edit-only evidence explicitly when git has no baseline.
