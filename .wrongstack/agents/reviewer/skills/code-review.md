## Verification

- Before flagging a Vitest subtree `exclude` allowlist as ineffective, `read vitest.config.ts` and inspect the live `exclude:` block. Exclusions are additive with no negative glob: entries under `packages/webui/**` take effect only if the broad `packages/webui/**` entry was removed, and review-bundle diffs can show that deletion as unchanged context. Broad entry gone → allowlist is live → emit `json { "findings": [] }`.
- Anchor every finding in the live tree, not the diff or a broad re-read. After external edits, reads can return stale pre-diff baselines, hide changes behind `[artifact middle omitted]`, or reject range re-reads as "unchanged since previous read." Before reporting missing work, `grep` a distinctive token with `context_lines` around the target function (e.g. `--no-ext-diff` in `packages/bench/src/suites/swebench-patch.ts`).

## Architecture ratchet

- Treat any edit to `architecture/hotspots.json` as requiring regeneration in the same change; validate with `validateHotspotBaseline` in `scripts/lib/architecture-health.mjs`. Flag `lines` or `relativeImports` drift for files at or above `thresholdLines` (800), missing entries for files ≥800 lines, and retained entries after a file drops below 800.
- Do not flag disappearing tail rows in the fixed 50-row "Largest production files" table of `docs/reports/architecture-health-current.md`; rows reflow with size and ordering.
