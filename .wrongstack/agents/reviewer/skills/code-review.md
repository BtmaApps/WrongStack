## Verification

- Before flagging a Vitest `exclude` allowlist as dead, `read vitest.config.ts` at the live `exclude:` block: exclusions are additive with no negative glob, so subtree entries take effect only if the broad `packages/webui/**` entry was removed — and review-bundle diffs can show that removal as unchanged context. Broad entry gone → allowlist is live → emit `json { "findings": [] }`.
- Anchor every finding in the live tree, not the diff or a cached read. After external edits, reads can return pre-diff baselines, hide hunks behind `[artifact middle omitted]`, or reject re-reads as "unchanged since previous read." Before reporting missing work, `grep` a distinctive token with `context_lines` around the target (e.g. `--no-ext-diff` in `packages/bench/src/suites/swebench-patch.ts`).

## Architecture ratchet

- Treat any edit to `architecture/hotspots.json` as requiring regeneration in the same change; validate with `validateHotspotBaseline` in `scripts/lib/architecture-health.mjs`. Flag `lines`/`relativeImports` drift at or above `thresholdLines` (800), missing entries for files ≥800 lines, and entries retained after a file drops below 800.
- Do not flag disappearing tail rows in the fixed 50-row "Largest production files" table of `docs/reports/architecture-health-current.md`; rows reflow with size and ordering.
