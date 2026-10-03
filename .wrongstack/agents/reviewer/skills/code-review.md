## Live-tree verification

- Before flagging a Vitest `exclude` allowlist as dead, `read vitest.config.ts` at the live `exclude:` block: exclusions are additive with no negative glob, so subtree excludes take effect only if the broad `packages/webui/**` entry was actually removed — review-bundle diffs can show that removal as unchanged context. Broad entry gone → allowlist is live → emit `{ "findings": [] }`.
- Extend this to every finding: anchor in the live tree, not the diff or a cached read. After external edits, reads can return pre-diff baselines, hide hunks behind `[artifact middle omitted]`, or refuse re-reads as "unchanged since previous read"; before reporting missing work, `grep` a distinctive token with `context_lines` around the target (e.g. `--no-ext-diff` in `packages/bench/src/suites/swebench-patch.ts`).

## Architecture ratchet

- Treat any edit to `architecture/hotspots.json` as requiring regeneration in the same change: validate with `validateHotspotBaseline` in `scripts/lib/architecture-health.mjs`, and flag `lines`/`relativeImports` drift at or above `thresholdLines` (800), missing entries for files ≥800 lines, and entries kept after a file drops below 800.
- Do not flag disappearing tail rows in the fixed 50-row "Largest production files" table of `docs/reports/architecture-health-current.md` — rows reflow with size and ordering.
