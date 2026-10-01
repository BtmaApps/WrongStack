## Pass-through option seams

- When a diff adds pass-through fields to a host-embedded interface, such as `StaticServeOptions` in `packages/webui-server/src/server/frontend-static-serve.ts`, grep every field name in the target options type and confirm that each is threaded through the single construction call site. Trace field sources explicitly: fields populated only from host config—not HTTP request bodies, query strings, or WS frames—add no new attack surface and are additive wiring, not security regressions.

## Verifying changed regions

- Prefer targeted `grep` checks over broad `read`s for changed regions. Reads can return a stale pre-diff baseline after external edits, while large-file output containing `[artifact middle omitted]` or the read cache can hide changes or reject range re-reads as “unchanged since previous read.” Before reporting a change as missing, grep for a distinctive new token such as `--no-ext-diff` in `packages/bench/src/suites/swebench-patch.ts`; in large files, use `context_lines` around the relevant function.

## Architecture ratchet

- Treat any edit to `architecture/hotspots.json` as requiring regeneration in the same change, and validate it with `validateHotspotBaseline` in `scripts/lib/architecture-health.mjs`. Reject `lines` or `relativeImports` drift for files at or above `thresholdLines` (800), missing entries for files ≥800 lines, or retained entries after files drop below 800. In `docs/reports/architecture-health-current.md`, do not flag disappearing tail rows in the fixed 50-row “Largest production files” table; its rows reflow with size and ordering changes.
