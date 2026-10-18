## Evidence harnesses

- In scratch Playwright harnesses such as `.temp_files/vibeui/design-probe.mjs`, assign shared page-side globals such as `window.__probeInfo` inside `page.evaluate(fn)`. Returned objects land in Node, not the page; verify globals before later evaluations spread them, since `{...undefined}` silently produces `{}`.

## Proof runs

- Inspect `.temp_files/proof-driven-bug-hunter/<round>/` with `tree` and read `vitest.proof.config.mjs` before selecting filenames or commands. Honor `include`, `environment: 'node'`, and required in-file jsdom pragmas. Use `run.mjs` when present; otherwise run `pnpm exec vitest run -c vitest.proof.config.mjs`. Root `vitest.config.ts` excludes `**/.temp_files/**`.
- Preserve `root: here`, `.replace(/\\/g, '/')`, and absolute `include` paths in `vitest.proof.config.mjs` to avoid silently collecting zero tests on Windows.
- Read direct-run script tails under `.temp_files/**` before trusting exit status: check whether failures set `process.exitCode=1`, as in `desktop-focus-fix/verify.mjs:185`, and inspect `evidence/results.json`. Before recommending a non-root rerun, check `process.cwd()`-rooted paths and pinned `node_modules/.bun/electron@<ver>+<hash>` executables.

## Discovery and verification

- Treat zero-result globs under `.temp_files/**` as inconclusive because ignore rules can suppress traversal. Before cleanup, inspect the target tree and confirm no nested `node_modules` junctions remain.
- Before reporting zero dependency consumers, rerun the exact repo-wide grep; concurrent changes to `pnpm-lock.yaml` or `packages/webui-hq/package.json` can invalidate earlier results.
- Declare `packages/plugins/tests/*.test.ts` orphaned only after checking `packages/plugins/vitest.config.ts`, root `vitest.config.ts`, `pnpm check:test-types`, and `docs/reports/architecture-health-current.json`.
- Test `@wrongstack/tools` and `@wrongstack/providers` through their `scripts.test`: `vitest run --root ../.. packages/tools/tests` and `vitest run --root ../.. packages/providers/tests`.

## Source contracts

- Read `packages/webui-server/tests/host-dispatcher-parity.test.ts` before editing `route-family-dispatcher.ts`; `balancedBlockAfter` depends on raw `createRouteFamilyDispatcher(` formatting.
- Check consumers of `packages/core/src/types/spec.ts` through both `./spec.js` and `@wrongstack/core/types/spec.js`.
