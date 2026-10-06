## Harness logs and temp artifacts

- Locate `%TEMP%/<tool>-<scenario>-<TAG>.log` producers with log-body `rg` in tracked scope plus a `.temp_files` filename-stem tree. Treat filenames as shell-redirect metadata absent from source, but map common stems to harnesses (`wstack-longlived-L4.log` → `.temp_files/longlived.mjs`); treat suffixes such as `-L4` as runtime `argv` labels when `*<TAG>*` returns zero.
- Map lines to producer `console.log` calls. If the `NO_PROJECT_DIR` guard reaches `### DONE`, call the log terminal and explicitly report later `SUMMARY=`/`VERDICT=` lines as absent.
- Direct-`read` `.temp_files` before inferring purpose (`_ts_baseline.txt` is a `git status --porcelain` snapshot, not TypeScript output). Path-scoped `grep` can false-zero under `.gitignore`; search a captured full-tree listing by filename stem and inspect siblings such as `_ts_after.txt`. For `cmd > file.txt`, tracked-scope plus stem-scan zeros close the reference search; do not invent a producer.

## Consumer closure

- Close `packages/tools/src/<feature>/tools.ts` with a repo-wide exported-symbol grep (`deadCodeScanTool|deadCodeFixTool`), not a `<feature>/tools` path grep: its direct importer is sibling `<feature>/index.ts`, while `packages/tools/src/builtin.ts` (`TIER` registries and `rawBuiltinTools`), `packages/tools/src/index.ts`, and tests use `../src/<feature>/index.js`.
- For any module, require three untruncated checks: repo-wide full-path token (`dead-code/resolve`), owning-directory relative ESM specifier (`from ['"]\.{1,2}/<stem>(\.js)?['"]`), then exported symbol (`DeadCodeResolver`) for type-only, barrel-mediated, and non-import references.

## Test collection

- Treat `packages/kanban-mcp` like `@wrongstack/tools`, `@wrongstack/providers`, and `packages/sage-mcp`: it has no local `vitest.config.ts`; `package.json` `scripts.test` echoes `pnpm exec vitest run packages/kanban-mcp/tests` from workspace root. Use root `vitest.config.ts` and `packages/kanban-mcp/tsconfig.test.json`.
- For `@wrongstack/tools/*` imports, account for vitest resolving `src/` while `tsconfig.test.json` resolves `dist/`. Read comments around `@wrongstack/tools/kanban` in `packages/kanban-mcp/tests/adapter.test.ts` and check `dist/` freshness before predicting typecheck/test disagreement.

## Proof-driven bug-hunter rounds

- Treat `.temp_files/proof-driven-bug-hunter/<round>/proof.test.ts` anchors such as `coordinateRegex (gradle.ts:88)` as pre-fix history; re-anchor to live `packages/<pkg>/src/...` via `codebase-skeleton`. Close consumers by grepping the full round-directory name, not generic `*proof.test.ts` matches under `packages/**/tests/**`.
- On first contact, capture `vitest.proof.config.ts`, `proof.test.ts`, and `run.mjs` in parallel reads; anchor findings to that capture and never retry vanished siblings.
- If initially absent, require untruncated direct `read`, exact-directory `tree`, wildcard `glob` such as `**/*gosum*` under `.temp_files`, and repo-wide `grep` of the full round-directory name before reporting negative. If an edit bypassed reading, require re-statting its absolute path or isolated worktree root; gitignored absence means no baseline or recovery.

## Hook wiring

- Do not infer `.githooks/pre-commit` is unused from a zero symbol index. Verify `package.json` `setup:hooks` running `git config core.hooksPath .githooks`, `readFileSync` assertions in `packages/core/tests/architecture/workflow-hardening.test.ts` pinning `sync-core-public-api-snapshot.mjs`, and guard-script headers naming the hook. Require a repo-wide `.githooks` grep before saying “no importers.”
