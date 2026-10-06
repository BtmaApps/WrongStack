# explore-companion Role Instructions

## Evidence and Submission

- Submit findings with `submit_result`; this role has no `mailbox`. Keep fields ASCII-only. If validation fails, shorten narrative and `files_examined` before removing evidence.
- Separate confirmed findings from inconclusive checks. Tool failure, ignored paths, stale indexes, truncation, skipped scopes, and unvalidated zero-hit searches do not prove absence.
- Read named targets directly. Confirm declarations, imports, assertions, collection wiring, and runtime paths rather than treating skeletons, reports, or call graphs as authoritative.
- Treat volatile files as current-state evidence only: recheck them before submission, and do not imply that a post-edit read reveals a pre-edit baseline.
- Never retry or bypass denied reads of `.npmrc`, `.env*`, `.pypirc`, or `.netrc`, including through indirect tools; report the restriction.
- Content searches do not include filenames. State spelling and directory scope, and confirm unexpected zeros with simpler searches or direct reads.

## Search and Consumer Closure

- Enumerate candidates with case-sensitive `files_with_matches` at `truncated=false` before using `content`; symbol-heavy files can exhaust per-file content limits.
- Start closure with a bare, stable module stem or exported-symbol grep. Import-specifier regex such as `from\s+['"][^'"]*<module>\.js['"]` is a refinement, not the sole authority.
- When a basename or test filename is generic, scope searches to the owning package. Pair that search with a repo-wide package/subpath probe, then confirm external exposure through the package’s `package.json`.
- Search the shortest stable path suffix as well as the full path: consumers may use relative paths, facades, deprecated shims, or canonicalization chains that bypass the original module path.
- Follow barrels and re-exporting facades for at least one extra hop. Split a module’s exports into locally declared and re-exported symbols, then split each consumer set into value imports and `import type`; module export, package-public API, and runtime dependency are different claims.
- For pure type modules, combine a module-stem/import-specifier search with a repo-wide exported-symbol search. `codebase-impact-analysis` can flood declaration-only files with unrelated `indirect:true, line:0` results, while incoming-call indexes may show only direct `type_ref`/`import` edges.
- Check public-API and test-only gates before predicting signature impact: `architecture/core-public-api-snapshot.json`, `architecture/test-only-exports.json`, package `exports`, and relevant barrel re-export forms.
- Include dynamic imports, source strings, subprocess arguments, and non-TypeScript harnesses. Search bodies for `spawn`/`exec` because import graphs cannot see project code reached only through a child process.
- Before accepting a dependency found by a token such as `VERDICT=`, inspect matching context. Comments and historical evidence strings are not runtime consumers.
- When `codebase-impact-analysis` reports indirect sites with `line: 0`, confirm them with literal searches before citing a file or line.

## Zero Results and Glob Reliability

- Treat a zero from `glob`, brace alternation such as `{a,b,c}`, or path-scoped grep as unproved until retried with a simple `*` wildcard, an explicit package-scoped pattern, and direct reads where applicable.
- Prefer explicit package-scoped patterns for tests, such as `packages/core/tests/coordination/*dep-watcher*.test.ts`; broad recursive globs can under-report in this repository.
- Use known-present control tokens to prove the intended tracked scope was searched. If the control fails, discard the pass rather than interpreting zero hits.
- Prove tracked and ignored scopes separately. A tracked-scope zero does not cover `.temp_files/`, `.design/`, `.reports/`, `docs/reports/`, or other gitignored namespaces.
- Do not use `codebase-impact-analysis` for a quick zero. For pure declarations, establish closure with direct symbol and import searches and state that the result is untruncated.

## Scratch and Ignored Workspaces

- Locate ignored artifacts with direct `read` or an exact-directory `tree`; directory-scoped grep may omit them entirely. For `.temp_files/*.mjs`, inspect imports, `readFileSync`, `spawn`, and `exec` before classifying coupling.
- A script whose only project touch is reading a hardcoded file has data-level coupling but no code blast radius; report its formatting or path sensitivity and confirm manual invocation with a repo-wide filename-stem search.
- Gitignored files have no Git recovery. Capture current content before an edit when possible, and state explicitly that a later read cannot reconstruct prior state.
- Treat `.temp_files/*.log` as producer/consumer evidence rather than source skeleton data: find producers with an exact-directory tree, confirm body tokens against `console.log`, then close real consumers with a stem search.
- If a log grows between reads, mark it live and request or perform a tail recheck; do not report a final line count or verdict.
- Distrust built-output token checks as source-location evidence. Minified `packages/*/dist` forms may not appear literally in `packages/*/src`; use a flexible source pattern such as `fetch.{0,4}mailbox` over the owning package before declaring a harness stale.

## Package and Wiring Facts

- Root `package.json` is a private script surface without `exports`, not an importable workspace package. Read workspace membership from `pnpm-workspace.yaml`; close programmatic manifest readers with `repoRoot`/`wrongstack-monorepo` searches and inspect `scripts/` readers directly.
- `packages/mcp/src/server.ts` is a pure re-export barrel, not an implementation location. Public exposure is controlled by the subset re-exported from `packages/mcp/src/index.ts` and then by package exports.
- Files exported by a leaf are not automatically package-public. Diff the leaf export list symbol-by-symbol against every relevant barrel; `export *` and named re-export lists have different exposure behavior.
- Sandbox consumers use `@wrongstack/core/sandbox`, not the `@wrongstack/core` barrel; validate any subpath through `package.json` before citing it.
- API signatures in `docs/adr/*.md` are historical design intent. Verify every cited signature against the current exporting module before analysis or refactoring.
- Configuration documentation can drift. For in-project policy, treat `packages/core/src/storage/config-loader/in-project-policy.ts` and its exported allow/deny constants as source of truth over prose docs.

## Test Collection and Gates

- Before predicting how a `packages/*` test is collected or gated, read the package `package.json` test script, any package-local `vitest.config.ts`, the root `vitest.config.ts`, and relevant `tsconfig.test.json`.
- Package-local configs override assumptions: `packages/mcp/vitest.config.ts` enforces 100% lines, functions, statements, and branches on `src/**` except its explicit barrel/type/helper exclusions. Concrete modules such as `transport-sse.ts`, `transport-streamable.ts`, and `packages/mcp/src/server.ts` require matching coverage.
- `packages/mcp/src/contracts.ts` is excluded by the MCP coverage config but is not necessarily package-internal; verify `packages/mcp/src/index.ts` and package exports separately.
- `docs/reports/architecture-health-current.json` may omit newer tests or hold stale per-file `projects`; use it only after confirming the live collector. For `packages/core/tests/**`, verify `packages/core/package.json` `scripts.test` and root `vitest.config.ts`.
- Root Vitest uses `globals: false`; hooks and reset helpers must be explicitly imported in `packages/**/tests/**/*.test.ts`, even when production typechecking passes.
- Leaf tests have no import graph. Check collectors, environment gates, coverage, typecheck baselines, and skip budgets rather than asking for test importers.

_(truncated at 8192 bytes — the next optimization pass must shorten it)_