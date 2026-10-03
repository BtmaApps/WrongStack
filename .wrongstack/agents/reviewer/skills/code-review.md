## Live-tree verification

- Before flagging a Vitest `exclude` allowlist as dead, `read vitest.config.ts` around the live `exclude:` block and confirm `packages/webui/**` is gone. Exclusions are additive with no negative glob, so subtree excludes are live only if that broad entry was removed; review-bundle diffs can still show it as unchanged context after a later deletion. Broad entry gone → allowlist works → emit `{ "findings": [] }`.
- Anchor every finding in the live tree, not the diff or a cached read. After external edits, reads can return pre-diff baselines, hide hunks behind `[artifact middle omitted]`, or refuse re-reads as "unchanged since previous read"; before reporting missing work, `grep` a distinctive token with `context_lines` (e.g. `--no-ext-diff` in `packages/bench/src/suites/swebench-patch.ts`).

## Architecture ratchet

- Any edit to `architecture/hotspots.json` must regenerate it in the same change. Validate with `validateHotspotBaseline` in `scripts/lib/architecture-health.mjs`. Flag `lines`/`relativeImports` drift at or above `thresholdLines` (800), missing entries for files ≥800 lines, and entries kept after a file drops below 800.
- Do not flag disappearing tail rows in the fixed 50-row "Largest production files" table of `docs/reports/architecture-health-current.md` — rows reflow with size and ordering.
