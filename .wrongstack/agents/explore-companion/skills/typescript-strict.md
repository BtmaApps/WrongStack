## Verify from current source

- Re-verify file-payload claims against current source before applying stale role notes. [applied 4×, 4 ok] `packages/core/src/sandbox/windows-helper.ts` is now the 82-line `runas /trustlevel:0x20000` variant (`defaultWindowsHelperRunner`), not the PowerShell/C# Safer P/Invoke script older notes describe — read its contract from the TypeScript signatures and header doc, and map sandbox blast radius from `windows-native.ts:11` (production), `sandbox/index.ts:34` (public-API snapshot gate), and env-gated `windows-native-integration.test.ts`.
- Apply the same file-first rule to consumer claims: range-read `packages/tools/src/builtin.ts` around `OPTIONAL_TOOLS` and `...browserTools` before declaring `outdatedTool` unused; enumerate `tsconfig.base.json` consumers with `rg 'tsconfig\.base\.json'` (call graphs cannot trace JSON references); treat `packages/tools/src/typecheck.ts` matches as filename discovery, not option consumption. `packages/webui/tsconfig.json`, `packages/simpleui/tsconfig.json`, and `packages/webui-hq/tsconfig.json` inline safety flags (bundler/JSX resolution blocks `extends`).

## Test collection

- Predict collection only from applicable configs: `packages/cli/tests/**` follows both `packages/cli/vitest.config.ts` and root `vitest.config.ts` (`include: packages/**/tests/**/*.test.{ts,tsx}`; tools/providers root-only; node env, `globals: false`, `setupFiles: ../../vitest.setup.ts`, `globalSetup: tests/sage-build-guard.global-setup.ts`).
- `packages/simpleui` has no `vitest.config.ts` — read `test: { maxWorkers }` and the react plugin in `packages/simpleui/vite.config.ts`, and keep `// @vitest-environment jsdom` in `packages/simpleui/tests/**` or Node fails on `document`.
- Judge CLI test deletions or weakenings against `coverage.exclude` (72/70/70/61 over `src/**`) before calling them safe.

## Typecheck gates

- Prove typecheck participation from files — `glob "packages/<pkg>/tsconfig*.json"` plus `tsconfig.test.json` and `*.test.ts` under `tests/` — never from absence in `scripts/check-test-typecheck.mjs` (`discoverProjects()` scans all workspace packages).
- `packages/simpleui` splits production (`packages/simpleui/tsconfig.json`, excludes tests) from tests (`tsconfig.test.json` via `pnpm check:test-types`); `tsc --noEmit -p tsconfig.test.json` gates edits even without that script.
- Treat new or increased diagnostics as release-blocking: they trip the `architecture/test-typecheck-baseline` ratchet in `release:check`.

- When tracing an error prefixed `WrongForge: `, check **both** mint sites in `packages/cli/src/wrongforge-leader/wrongforge-leader-provider.ts`: `taskError()` renders failed task records as `` `${code}: ${message}` `` and special-cases `context_overflow` → status 413 / kind `context_overflow`, while `providerError()` wraps direct `WfHttpError` calls where a generic 400 becomes kind `invalid_request`. Always attribute the text *after* the prefix to the external service at `WRONGFORGE_URL` (default `http://127.0.0.1:8787`, resolved by `resolveWrongForgeEndpoint` in `packages/cli/src/fleet/wrongforge-client.ts`) — expect zero repo-grep hits for it, and treat `context_overflow` as compaction-owned and non-fallback-eligible (`docs/agents.md` recovery-layer rules). (anchors: `WrongForge:`, `packages/cli/src/wrongforge-leader/wrongforge-leader-provider.ts`, `taskError()`, `and special-cases`, `→ status 413 / kind`, `, while`, `wraps direct`, `calls where a generic 400 becomes kind`, `. Always attribute the text *after* the prefix to the external service at`, `(default`, `, resolved by`, `in`, `) — expect zero repo-grep hits for it, and treat`, `as compaction-owned and non-fallback-eligible (`, `packages/cli/src/fleet/wrongforge-client.ts`, `docs/agents.md`) [applied 10×, 10 ok]

---
*Distilled 2026-10-19T06:32:45.640Z · 1 new directive*
