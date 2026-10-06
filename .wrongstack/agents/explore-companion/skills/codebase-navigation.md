## Temp artifacts and harness logs
- Locate `%TEMP%/<tool>-<scenario>-<TAG>.log` producers by log body tokens in tracked `rg` plus a `.temp_files` filename-stem tree; redirect names appear in no source, but stems often match harness scripts (`wstack-longlived-L4.log` -> `.temp_files/longlived.mjs`). Confirm `-L4` as runtime `argv` with `*<TAG>*` returning zero.
- Map harness-log lines to producer `console.log`; a guard branch (`NO_PROJECT_DIR` ... `### DONE`) means later `SUMMARY=`/`VERDICT=` never ran. Distinguish quoted comment tokens (e.g. `VERDICT=STILL_ABORTED` in `packages/cli/tests/tech-stack-audit-*.test.ts`) from real consumers.
- Do not infer `.temp_files` purpose from names: `_ts_baseline.txt` is `git status --porcelain`. Path-scoped `grep` can false-zero because `rg` honors `.gitignore`; scan the tree log/stem and tracked scope before closure.

## Workspace test collection
- Treat `packages/kanban-mcp` like `@wrongstack/tools`, `@wrongstack/providers`, and `packages/sage-mcp`: it has no local `vitest.config.ts`; `scripts.test` echoes `pnpm exec vitest run packages/kanban-mcp/tests` from root. Use root `vitest.config.ts` and `packages/kanban-mcp/tsconfig.test.json` as contracts.
- For namespace imports `@wrongstack/tools/*`, vitest aliases resolve `src/` while `tsconfig.test.json` resolves `dist/`; before predicting disagreement read import comments (e.g. `packages/kanban-mcp/tests/adapter.test.ts`, `@wrongstack/tools/kanban`) and check `dist/` freshness.

## Proof-driven bug-hunter rounds
- Treat `.temp_files/proof-driven-bug-hunter/<round>/proof.test.ts` header/error anchors (`coordinateRegex (gradle.ts:88)`) as pre-fix history; re-anchor against live `packages/<pkg>/src/...` via `codebase-skeleton` before editing.
- Capture siblings `vitest.proof.config.ts`, `proof.test.ts`, `run.mjs` in parallel on first contact; if absent, prove with `read`, `tree`, wildcard `glob` (`**/*gosum*` under `.temp_files`), and repo-wide `grep` of the full round dir, then report negative.
- Close round consumers by grepping the full round-directory name, not just `proof.test.ts`; unrelated `packages/**/tests/**/*proof.test.ts` create false matches.

## Hooks and non-import wiring
- For `.githooks/pre-commit`, a zero symbol index is not absence. Confirm via `package.json` `setup:hooks` (`git config core.hooksPath .githooks`), tests using `readFileSync` (`packages/core/tests/architecture/workflow-hardening.test.ts` pinning `sync-core-public-api-snapshot.mjs`), and header comments naming the invoker.
