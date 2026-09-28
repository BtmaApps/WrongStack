## Scratch harnesses

- For browser checks under `.temp_files/` (e.g. `at-mention-browser-check/check.mjs`), trace reverse blast radius from fixture source strings, `[data-chat-textarea]`, FilePicker button-name regex, and stubbed `getWSClient` methods: `listFiles`, `files.list`, `send`, and `isConnected` via `defineProperty`. Webui component/store edits can change harness verdicts and exit codes while repo tests stay green.
- Resolve harness dependencies `vite` and `@playwright/test` through `createRequire` against `packages/webui/package.json`. Check invocation separately from dependency coupling: no textual references outside grep-excluded `.temp_files/` supports “manual-run only,” but does not rule out dynamic invocation.
- Inspect `.temp_files/*.cjs` for external mutations before running. `plant-probe.cjs` targets `DIR = 'C:/Users/<user>/.wrongstack/projects/<id>'` and user-owned `review-reports.jsonl`, `review-findings.jsonl`, `.review-store-maintenance.json`. Avoid repeating non-idempotent `fs.appendFileSync` probes; dedupe cleanup by namespaced id prefix.

## Ownership and consumers

- Map `ChatInput/` importers within `packages/webui/src` and `packages/webui/tests`: `packages/webui/src/components/ChatInput.tsx` owns runtime imports such as `./ChatInput/file-mention-picker.js`; `session-draft.ts` and `use-chat-keydown.ts` share types through `import type`. Do not infer `view-registry.ts` lazy registration.
- Treat root `CHANGELOG.md` as filename-coupled. Inspect `changelog-writer` at `packages/plugins/src/changelog-writer/index.ts` (`filePath`, `## [Unreleased]`), `semver-bump` (`changelogFile`), `doc-sync-guard` (`docNames`), git-autocommit release bumps, and `website/src/lib/utils.ts`; distinguish test mocks/defaults from root-file reads.
- Read `package.json` (`exports`, `main`, `private`) and `pnpm-workspace.yaml` (`packages:`, `link:`) directly; `codebase-skeleton` returning `symbolCount: 0` and absent `codebase-incoming-calls` graphs do not establish non-use. Count-mode grep `package\.json` under `scripts/` to distinguish root from per-package readers.

## Verification

- Read root `vitest.config.ts` `exclude` and package scripts before claiming coverage. Root `vitest run` excludes `packages/webui/**`; use `cd packages/webui && npx vitest run <file>`. In `packages/webui/vitest.config.ts`, `tests/server/**` uses node; other `tests/**/*.test.{ts,tsx}` use `browser-jsdom`.
- Run `packages/cli/tests/hq-dashboard.test.ts` with `pnpm --filter @wrongstack/cli test:hqdash`, using `packages/cli/vitest.hqdash.config.ts`; save proof under `.reports/release-check-matrix/*.log`.
