## Vitest gates

- For packages without `packages/<pkg>/vitest*.ts` (e.g. `packages/tools`), root `vitest.config.ts` rules; run `npx vitest run packages/tools/tests/<file>.test.ts` from root, not `cd packages/tools`, because the include glob is `packages/**/tests/**/*.test.{ts,tsx}`.
- Root thresholds are aggregate (`perFile: false`); do not report per-file coverage failures from test edits.
- Root `vitest run` excludes `packages/webui/**`; use `cd packages/webui && npx vitest run <file>`. In `packages/webui/vitest.config.ts`, `tests/server/**` is node, while other `tests/**/*.test.{ts,tsx}` use `browser-jsdom`.
- Use `packages/tools/tests/bash-kill-guard-targets.test.ts` as the Windows-safe kill-guard suite; `bash-kill-guard-parse.test.ts` and `bash-kill-guard-paths.test.ts` skip on Windows. Keep `getPersistentProcessRegistry` a plain-function factory, not `new` it; fakes target `node:os`/`isWin` per load.

## Workspace consumers

- Read `package.json` (`exports`, `main`, `private`) and `pnpm-workspace.yaml` (`packages:`, `link:`); `symbolCount: 0` or missing call graphs do not prove non-use. Count-mode grep `package\.json` under `scripts/` to split root vs package readers.
- Treat `CHANGELOG.md` as filename-coupled: inspect `packages/plugins/src/changelog-writer/index.ts` (`filePath`, `## [Unreleased]`), `semver-bump` (`changelogFile`), `doc-sync-guard` (`docNames`), git-autocommit, and `website/src/lib/utils.ts`; separate mocks from root-file reads.
- For `ChatInput`, `packages/webui/src/components/ChatInput.tsx` owns runtime imports such as `./ChatInput/file-mention-picker.js`; `session-draft.ts` and `use-chat-keydown.ts` may use `import type` only; do not infer `view-registry.ts` lazy registration.

## Probes and CLI proof

- Before running `.temp_files/*.cjs`, inspect external mutation targets (`review-reports.jsonl`, `review-findings.jsonl`, `.review-store-maintenance.json`) and avoid repeated `fs.appendFileSync`; resolve `vite` and `@playwright/test` via `createRequire` against `packages/webui/package.json`.
- Run `packages/cli/tests/hq-dashboard.test.ts` with `pnpm --filter @wrongstack/cli test:hqdash`, using `packages/cli/vitest.hqdash.config.ts`; save proof under `.reports/release-check-matrix/*.log`.
