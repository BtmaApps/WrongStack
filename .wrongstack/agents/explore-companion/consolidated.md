# explore-companion Role Instructions

## Result Submission

- Submit findings through `submit_result`; this role has no `mailbox` capability. Keep every field ASCII-only. If validation rejects a result, shorten the narrative and `files_examined` before removing evidence.
- Separate confirmed findings from inconclusive checks. A failed tool, ignored path, unavailable index, or unqualified zero-hit result is not proof of absence.
- State evidence freshness. Re-read volatile targets before finalizing and report concurrent edits, deletion, or a missing baseline that limits conclusions.

## Evidence Discipline

- Read named files directly. Treat `codebase-skeleton` line ranges as approximate; pin declarations, imports, and assertions with exact searches or short reads.
- `glob` and `grep` honor ignore rules. For ignored paths such as `.temp_files/`, `dist/`, and `.wrongstack/`, use an exact-directory `tree` with `truncated=false` plus direct reads; `codebase-search` is not authoritative.
- A zero-hit content grep does not prove a file is absent. Prove absence with a direct `read` (authoritative `ENOENT`) and an untruncated exact-directory `tree`; for volatile ignored trees, check at probe start and end.
- Content-mode `grep` may display only three rows per file even when `count=14 shown=14 truncated=false`; this display cap is independent of truncation. First build an exhaustive candidate set with an exact-token `files_with_matches` search and `truncated=false`, then use a file-scoped content search or direct reads for omitted usage lines.
- Treat call graphs as corroboration only: they may miss ignored files, writes, barrels, dynamic/type-only imports, mocks, and name collisions. Treat `git diff HEAD` as historical evidence only for tracked files.

## Consumer and Public-API Mapping

- Never reuse a stored importer count or exact-\(N\) claim. Rerun live repository-wide searches and require `truncated=false` before reporting completeness.
- Search both the leaf-module specifier and exact exported-symbol names in `files_with_matches` mode. Search relative, package, subpath, and barrel specifiers; a `from`-line-only search can miss `vi.mock` references.
- Verify every candidate in content mode with surrounding context. Reject suffix collisions, comments, documentation, generated reports, and same-named implementations; read complete multiline import blocks before identifying imported symbols.
- For common test stems, enumerate exact filenames first with a glob such as `glob "**/runtime.test.ts"`. Bare stem counts cannot distinguish packages or comment mentions.
- Read every intermediary barrel and the package export map before declaring a module private. Distinguish `export *` from explicit re-export lists and treat underscore-prefixed modules as potentially public.
- Verify every `codebase-incoming-calls` row, especially `callType: "import"`, with an exact `\b<symbol>\b` content grep over `src`. Import rows can be anchored to an unrelated enclosing declaration and do not reliably identify the referencing structure.
- For manifest dependents, classify actual readers and writers by operations such as `collectManifests()`, `readFileSync`, and `resolve`; search hits alone are not dependency edges. Read `pnpm-workspace.yaml` rather than expecting a `workspaces` field.

## Test Impact

- Read the full test before predicting impact. Enumerate assertions, imported values and types, events, errors, platform gates, snapshots, strict `fetch` stubs, and partial `vi.mock` requirements.
- Cross-check each assertion against the live production callee, especially return statements and types. Do not infer behavior from comments or historical assumptions.
- For partial mocks, verify that the `vi.mock()` specifier still resolves to the intended live module. Check it separately from the dynamic-import target because those modules may differ; a stale mock specifier can leave the real implementation active.
- Resolve commands from live package scripts and Vitest configuration. Read `coverage.include` and thresholds before predicting gate impact; root coverage uses aggregate `perFile: false` thresholds and excludes `**/.temp_files/**`.

## Proof Rounds and Scratch Artifacts

- Snapshot live `.temp_files/` targets with exact `tree` checks at probe start and end. Capture a full direct read on first success and re-read immediately before finalizing.
- Triage `.log`, `.txt`, and `.json` files as captured artifacts before source-module search. Discover runner artifacts by exact round or owner prefix, not an assumed full filename.
- An output whose last block is `START` without a matching `END` represents a live or interrupted run, not a completed proof round. Preserve existing evidence before recommending another run.
- PowerShell parses a script to AST before execution, so later edits do not alter an in-flight instance. Avoid reruns when startup deletes files or concurrent instances share append targets.
- Run round tests from repository root with `npx vitest run --config <round>/<exact-config>`. Inspect `root`, aliases, and include resolution, then enumerate sibling `*.test.ts` files before interpreting an exact or wildcard stem.

## Project Facts

- `packages/webui-server/vitest.config.ts` defines one Node project with `include: ['tests/**/*.test.ts']` and coverage thresholds of statements 76, functions 69, and branches 66. Do not apply the `packages/webui` `server-node`/`browser-jsdom` split to this package.
- In `packages/webui-server`, `startHttpServer` comes from `src/server/server-runtime.ts`, while `http-server.ts` declares `allowedHostnames` and consumes it as `trustedHostnames`. Existing hostname coverage is in `tests/ws-auth.test.ts` and `tests/frontend-static-serve.test.ts`, not `tests/http-server.test.ts`.
- `scripts/bump-version.mjs` (`collectManifests()`) is the root `version` writer. Root-manifest readers are `scripts/build-portable.mjs`, `scripts/test-affected.mjs` via `SALT_FILES`, and `scripts/release-check-matrix.mjs` via a version-insensitive hash. Reverify with a literal `'package.json'` content search under `scripts/`.
- Production tools under `packages/tools/src/*.ts` are normally imported by `src/index.ts` for re-exports and `src/builtin.ts` for registration, while tests may import `../src/*.js` directly. Prove current topology with separate searches for the tool constant and exports such as `TreeInput`, `TreeOutput`, and `MAX_TREE_OUTPUT_BYTES`; verify `tree.js` hits are not `session-tree.js` or `resume-session-tree.js` collisions.
- Cross-package consumers may be invisible to leaf-specifier searches. `packages/vector-memory/src/sage-port-wrapper.ts` consumes Sage exports through `@wrongstack/sage` and `packages/sage/src/index.ts`; CLI handler factories flow through `src/server/index.ts` and `@wrongstack/webui-server` to `packages/cli/src/webui-server/route-contexts.ts`.
- `architecture/*.json` files are data loaded through `fs`, not ordinary imports. Architecture API snapshots do not enumerate every subpath or `export *` surface, so verify live barrels and package exports before claiming privacy.