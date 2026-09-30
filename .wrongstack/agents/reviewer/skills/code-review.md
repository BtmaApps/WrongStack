## Verifying changed regions

- When `read` returns a pre-diff baseline but bundle provenance contains `file.external.edit`, do not report the change as missing. Confirm with live `grep` for a distinctive new token—e.g. `--no-ext-diff` in `packages/bench/src/suites/swebench-patch.ts`—because reads may serve stale snapshots after concurrent external edits.
- If changed files are listed without diff hunks, avoid a full-file `read` for large files: `[artifact middle omitted]` and the read cache can otherwise hide the changed region or reject range re-reads as "unchanged since previous read." Use `grep` with `context_lines` around relevant function names instead.

## Architecture ratchet

- Treat every edit to `architecture/hotspots.json` as requiring regeneration in the same change. Verify `validateHotspotBaseline` in `scripts/lib/architecture-health.mjs`: reject `lines` or `relativeImports` drift for files at or above `thresholdLines` (800), missing baseline entries for ≥800-line files, and retained entries for files that dropped below 800 lines.
- When reviewing the paired `docs/reports/architecture-health-current.md`, do not flag disappearing tail rows in the "Largest production files" table; its fixed 50-row cap can reflow when file sizes or ordering change.
