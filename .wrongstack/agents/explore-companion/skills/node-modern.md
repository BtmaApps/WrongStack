## Module ownership probes

- Treat `packages/webui/src/components/ChatInput.tsx` as the sole owner of the `ChatInput/` feature directory: only it imports runtime pieces from `./ChatInput/*` (e.g. `file-mention-picker.js`); siblings like `session-draft.ts` and `use-chat-keydown.ts` share only types (e.g. `FileMentionState`) via `import type`. These leaves have no `view-registry.ts` lazy registration — build importer maps from greps scoped to `packages/webui/src` and `packages/webui/tests`.

## Consumers and blast radius

- Treat root `CHANGELOG.md` as filename-coupled, never import-coupled. Consumers: `changelog-writer` (`packages/plugins/src/changelog-writer/index.ts`, `filePath`, merges under `## [Unreleased]`), `semver-bump` (`changelogFile`), `doc-sync-guard` (`docNames`), git-autocommit release bumps, and the hand mirror in `website/src/lib/utils.ts`. Inspect path and structure before judging edit risk; `CHANGELOG.md` hits in tests are node_modules mocks or config defaults, not root-file reads.
- Assess `.temp_files/*.cjs` by hardcoded external targets, not repo grep: `plant-probe.cjs` (`DIR = 'C:/Users/<user>/.wrongstack/projects/<id>'`) mutates user-owned `review-reports.jsonl`, `review-findings.jsonl`, and `.review-store-maintenance.json`; zero filename-grep callers does not mean safe. Flag additive `fs.appendFileSync` probes without idempotency — repeated `node <script>.cjs` runs stack rows; dedupe cleanup by namespaced id prefix.
- Treat `package.json` and `pnpm-workspace.yaml` probes as index-blind: expect `codebase-skeleton` `symbolCount: 0` and no `codebase-incoming-calls` graph. Read the manifest (`exports`, `main`, `private`), check `packages:` and `link:` in `pnpm-workspace.yaml`, then count-mode grep `package\.json` under `scripts/` to separate root-manifest readers from per-package matches.
- The todo store is runtime-only: an empty `glob .wrongstack/**/*todo*` proves nothing. Use mtime-ordered `glob` over `packages/*/src` plus `git diff HEAD`; ignore `.wrongstack/domain-terms.md` boilerplate.

## Verification and reporting

- Before claiming verification, read `exclude` in root `vitest.config.ts` and the touched package's `package.json` scripts; only a command that executes the target counts.
- Root `vitest run` excludes `packages/webui/**` — use `cd packages/webui && npx vitest run <file>`. In `packages/webui/vitest.config.ts`, `tests/server/**` uses node; other `tests/**/*.test.{ts,tsx}` use `browser-jsdom`, even when DOM-free.
- Run `packages/cli/tests/hq-dashboard.test.ts` via `pnpm --filter @wrongstack/cli test:hqdash` (config: `packages/cli/vitest.hqdash.config.ts`); derive the narrowest script-supported filter and save proof under `.reports/release-check-matrix/*.log`.
- Keep `submit_result` ASCII-only, ≤7 short `findings`, ≤3 `files_examined`; if the required-field error fires on a complete payload, trim size and retry.
