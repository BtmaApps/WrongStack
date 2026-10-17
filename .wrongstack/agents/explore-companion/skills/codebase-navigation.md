## Desktop Build Surfaces

- Trace `apps/desktop` entrypoints as build artifacts, not imported modules: inspect `entries` in `scripts/build-package.mjs` for `src/main/main.ts`, `src/main/agent-bridge.ts`, and `entries: { preload: 'src/main/preload.ts' }`. Follow `main` → `dist/main` (ESM), preload → `dist/preload/*.cjs`, and `"main"` in `apps/desktop/package.json`. Zero import-grep or `codebase-incoming-calls` results do not establish absence of consumers.
- For preload consumers, grep the `contextBridge.exposeInMainWorld` global name, such as `wrongstackDesktop`; inspect `runtime-manager-paths.ts` for load sites. Classify `architecture/*.json`, `docs/reports/architecture-health-current.json`, and `.wrongstack/atlas/*` references as metadata, not code consumers.

## Consumer Closure

- Close consumer claims for `packages/core/src/utils/*` with repo-wide exported-symbol grep, not just `codebase-incoming-calls`: `utils/index.ts` hides downstream consumers such as those of `checkConnectivity`. Check `architecture/core-public-api-snapshot.json` for exact barrel-line gates.
- Treat `apps/desktop/src/main/validation/schemas.ts` and `apps/desktop/src/main/validation/index.ts` as separately imported modules. The utilities barrel does not re-export schemas; use repo-wide module-path grep `validation/schemas(\.js)?["']` to close schema consumers.
- For `packages/requirement-intake/src/index.ts`, combine module-path and symbol-name greps to uncover consumers importing `@wrongstack/requirement-intake`.
- Do not pass filename stems to `codebase-impact-analysis`. For `packages/core/src/security/secret-scrubber-patterns.ts`, combine incoming calls on `PATTERNS` with module-path grep `secret-scrubber-patterns(\.js)?`.

## Unindexed Files

- Inspect `node_modules/.bun/<pkg>@<ver>+<hash>/node_modules/<pkg>/` using direct `read` and repo-wide `grep` of `**/package.json` and `bun.lock`; do not reindex. For package-script callers, check the package’s `package.json` (`scripts`, `bin`), sibling launchers using `spawnSync`/require (e.g. Electron’s `index.js` → `install.js`), then repository dependency declarations.
- Before judging scratch Electron harnesses under `.temp_files/**` runnable, verify `executablePath` against `node_modules/.bun/electron@<ver>+<hash>/node_modules/electron/dist/electron.exe`; `bun install` can invalidate that pinned hash without changing the script. Inspect directly: `.temp_files/**` is outside the index.
- When a proof-driven-bug-hunter round is expected, `tree` `.temp_files/proof-driven-bug-hunter/` directly; ignored-directory `glob` results cannot prove absence.
