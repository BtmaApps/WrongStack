## Test Boundaries

- Verify the CLI suite with both `bun run test` in `packages/cli` and `bun run test:hqdash`: `packages/cli/vitest.config.ts` excludes `tests/hq-dashboard.test.ts`; `vitest.hqdash.config.ts` collects it.
- Check `architecture/test-typecheck-baseline/packages-<pkg>.json` before predicting ratchet impact. A missing baseline, including `packages-sage.json`, means zero tolerated diagnostics—not exemption.
- Distinguish package-local from root tests: `packages/webui-server/vitest.config.ts` omits root `setupFiles` (`./vitest.setup.ts`, hermetic `WRONGSTACK_HOME`) and `globalSetup` (`./vitest.globalTeardown.ts`, daemon reaping).

## Consumer Closure

- For prefix-colliding modules such as `cli-main.ts`, use `from\s+["'][^"']*\b<module>(\.js)?["']` plus `import()`/`require()` variants. Avoid bare-name searches polluted by `cli-main-helpers.ts`, `cli-main-boot.ts`, and `docs/reports/*.json`.
- In `packages/cli/src/slash-commands/`, reconcile matches with `from './<stem>.js'`; `rg`/`files_with_matches` searches content, so `memory-compact.ts` need not match itself (`/memory compact` differs).
- For `packages/webui-server/src/server/start-webui.ts`, combine module-specifier search (`from '...start-webui.js'`), `\bstartWebUI\s*\(`, and context reads. Follow `src/server/entry.ts` through `src/server/index.ts` and `scripts/build-package.mjs` to `@wrongstack/webui-server`; distinguish generated-source strings in `packages/webui-server/tests/auth-live-browser-smoke.mjs` and `packages/webui/tests/kanban-start-webui-smoke.mjs` from direct calls.
- Treat `codebase-impact-analysis` output with `totalCallSites=0`, `symbolFound=true`, and unrelated `line:0` closures as noise. For `@wrongstack/sage`, search exact exports under `packages/sage/src`, module specifiers, and `store-helpers.ts`; unrelated `apps/desktop` entries do not establish callers.
- For `packages/kanban/src/manager/*`, search direct specifiers and `manager/_internal(\.js)?`: `_internal.ts` mediates verification and test consumers.
- For React components, search rendered selectors too: `.workspace-notes` is consumed by `packages/vibeui/tests/browser-smoke.mjs`, outside `codebase-incoming-calls`.

## Scratch Evidence

- Close callers under `.temp_files/proof-driven-bug-hunter/<round>/` using path-scoped stem grep, repo-wide round-name grep, and `tree`. `codebase-*` excludes `.temp_files/**`; zero hits prove nothing. Without `run.mjs`/`vitest.proof.config.mjs`, treat probes as manual direct-runs via `bun`, not sibling-invoked tests.
- Resume floating-promise audits from `.temp_files/core_fire_and_forget_scan/scan.mjs`, not a rebuilt scanner. Use `--all` for out-of-window `[trace-caller]` hits and reuse `.temp_files/audit-all--round*/logs/{<pkg>-scope.json,F*-before/after/verify*.json,repo-typecheck.json}`.
