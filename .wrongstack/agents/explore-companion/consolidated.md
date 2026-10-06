# explore-companion Role Instructions

## Evidence and Submission

- Submit findings with `submit_result`; this role has no submission `mailbox`. Keep fields ASCII-only; on validation failure, shorten narrative and `files_examined` before dropping evidence.
- Separate confirmed findings from inconclusive checks. Tool errors, ignored paths, stale indexes, truncation, denied reads, skipped scopes, and unvalidated zero-hit searches do not prove absence.
- Read named targets directly and verify declarations, re-exports, imports, assertions, collector wiring, and runtime paths. Treat `codebase-skeleton`, impact reports, and incoming-call graphs as leads, not authority.
- Treat volatile or gitignored content as current-state evidence. Capture before editing; a read after an unread edit is a surviving record, not a pre-edit baseline.
- Never retry or bypass denied reads of `.npmrc`, `.env*`, `.pypirc`, or `.netrc`; report the restriction.
- Content search does not search filenames. State scope and spelling; confirm unexpected zeros with direct reads or simpler filename searches.

## Search and Consumer Closure

- Enumerate matches with case-sensitive `files_with_matches` at `truncated=false` before `content`; never cite truncated output as closure.
- Close module consumers with three passes: repo-wide full-path/subpath, sibling-relative `from ['"]\.{1,2}/<stem>(\.js)?['"]`, and repo-wide exported symbol. Report all untruncated; each catches references the others miss.
- For `packages/tools/src/<feature>/tools.ts`, search exports such as `deadCodeScanTool|deadCodeFixTool`, not only `<feature>/tools`; `builtin.ts`, barrels, and tests often import through `<feature>/index.ts` or package roots.
- Scope generic stems and test names to their package, then pair with a repo-wide package/subpath search. Search a proof round's full directory name, not generic `proof.test.ts`.
- Follow barrels and facades one hop, separating declarations, re-exports, value imports, and `import type`. Check `architecture/core-public-api-snapshot.json`, `architecture/test-only-exports.json`, package `exports`, and relevant barrels before API claims.
- Search dynamic imports, source strings, subprocess arguments, and non-TypeScript harnesses, including `spawn` and `exec` bodies. Verify impact-report hits and `line: 0` sites with literal search; comments and historical evidence are not runtime consumers.

## Ignored and Scratch Files

- Treat zero from `glob`, brace alternation, or path-scoped grep as unproved until a simple `*`, explicit package scope, and direct reads agree. Use a known-positive scope control.
- Search tracked and ignored namespaces separately. `rg` honors `.gitignore` even with an explicit path, so use direct `read`, exact `tree`, or the full tree listing before claiming zero under `.temp_files`.
- Read scratch files before classifying them: `_ts_baseline.txt` can be `git status --porcelain`. Inspect `.mjs` imports, `readFileSync`, `spawn`, and `exec`; a hardcoded-file reader has data coupling, not code blast radius.

## Volatile Proof Harnesses

- On first contact with `.temp_files/proof-driven-bug-hunter/<round>/`, request `vitest.proof.config.ts`, `proof.test.ts`, `run.mjs`, and logs in parallel; preserve config → test → logs interpretation order. On ENOENT, re-tree the parent once, stop retrying vanished files, and treat captured content as the surviving record.
- Always inspect sibling `vitest.proof.config.ts`; not every round uses `run.mjs`. `test.include` pins the test, while `path.resolve(__dirname, '..','..','..')` and `../../../packages/...` require the round to remain exactly three levels below repo root; keep config and test at matching depth.
- To close a proof config's blast radius, use two untruncated checks: grep the full round-directory name in tracked scope and verify root `vitest.config.ts` excludes `.temp_files`. The shared depth assumption is the remaining fragility.
- Treat header-comment and inline-error coordinates in a proof round as pre-fix history. Re-anchor the live module with `codebase-skeleton`; close consumers with the full round-directory name.
- If the target is absent initially, run direct `read`, exact-directory `tree`, wildcard stem `glob`, and repo-wide grep of the full round name before reporting absence. Require a re-stat of the absolute path or isolated worktree root to verify an edit's landing; never map a phantom.
- A `red.log` with only a RUN header and no PASS/FAIL is an aborted capture; report missing verdict lines, never RED or GREEN.

## Logs and Diagnostics

- Locate `%TEMP%/<tool>-<scenario>-<TAG>.log` producers with body-token `grep` in tracked scope plus a `.temp_files` filename-stem tree. Shell redirects create no source reference; matching harness stems are clues, while `*<TAG>*` filename zero is inconclusive because tags come from `argv`.
- Map log lines to `console.log` and inspect early exits. A guard ending at `### DONE` proves later DB, `SUMMARY=`, and `VERDICT=` phases did not run; report absent verdicts explicitly.
- Re-anchor truncated lint diagnostics using exact cited-line content against live source. If a log grows, mark it live and tail-check before reporting a final count or verdict.

## Project Wiring

- For `.githooks/pre-commit`, an empty symbol index is not disconnection. Check `package.json` (`git config core.hooksPath .githooks` under `setup:hooks`), tests such as `packages/core/tests/architecture/workflow-hardening.test.ts` that `readFileSync` the hook, invoker comments, and a repo-wide `.githooks` grep.
- Mailbox evidence lives at `~/.wrongstack/projects/<dir>/_mailbox.sqlite`: `messages(from_id, to_id, type, data)`, with JSON `data` containing `subject` and `body`. Open read-only via `node:sqlite` `DatabaseSync` and `{ readOnly: true }`.
- Root `package.json` is a private script surface without `exports`; read membership from `pnpm-workspace.yaml`. `packages/mcp/src/server.ts` is a pure barrel; exposure continues through `packages/mcp/src/index.ts` and package exports.
- Validate subpaths against manifests: sandbox uses `@wrongstack/core/sandbox`, not `@wrongstack/core`. Treat `docs/adr/*.md` signatures as historical and current policy from `packages/core/src/storage/config-loader/in-project-policy.ts`.

## Test Collection and Gates

- Before predicting collection, read package `package.json`, local `vitest.config.ts` if any, root `vitest.config.ts`, and relevant `tsconfig.test.json`.
- `packages/kanban-mcp` has no local Vitest config; `scripts.test` echoes `pnpm exec vitest run packages/kanban-mcp/tests` from workspace root. Root `vitest.config.ts` and `packages/kanban-mcp/tsconfig.test.json` govern collection.
- In kanban tests, `@wrongstack/tools/*` aliases may resolve to `src/` while `tsconfig.test.json` resolves to `dist/`; read comments in `packages/kanban-mcp/tests/adapter.test.ts` and check `dist/` freshness before predicting test/typecheck disagreement.
- `packages/mcp/vitest.config.ts` requires 100% lines, functions, statements, and branches on `src/**` except explicit exclusions; `contracts.ts` is excluded there but may remain public. Root Vitest has `globals: false`, so hooks and reset helpers need explicit imports.
- `docs/reports/architecture-health-current.json` may be stale. Confirm live collectors; leaf tests have no import graph, so inspect scripts, gates, coverage, typecheck baselines, and skip budgets.