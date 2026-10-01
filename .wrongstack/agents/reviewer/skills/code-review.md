## Pass-through option seams

- When a diff adds pass-through fields to a host-embedded seam interface (e.g. `StaticServeOptions` in `packages/webui-server/src/server/frontend-static-serve.ts`), grep each field name in the target options type and confirm it is threaded at the single construction call site before judging. Rule on exposure explicitly: fields sourced only from host config — never from HTTP request bodies, query strings, or WS frames — add no new attack surface; call the change additive wiring, not a security regression.

## Verifying changed regions

- Prefer `grep` over `read` for changed regions. Reads can serve a stale pre-diff baseline after concurrent external edits (provenance `file.external.edit`), and in large files `[artifact middle omitted]` and the read cache can hide the changed region or reject range re-reads as "unchanged since previous read". Before reporting a change as missing, grep for a distinctive new token (e.g. `--no-ext-diff` in `packages/bench/src/suites/swebench-patch.ts`); in large files, grep with `context_lines` around the relevant function names instead of reading.

## Architecture ratchet

- Treat any edit to `architecture/hotspots.json` as requiring regeneration in the same change; validate with `validateHotspotBaseline` in `scripts/lib/architecture-health.mjs`. Reject `lines` or `relativeImports` drift for files at or above `thresholdLines` (800), missing baseline entries for ≥800-line files, and retained entries for files that dropped below 800.
- In the paired `docs/reports/architecture-health-current.md`, do not flag disappearing tail rows in the "Largest production files" table — the fixed 50-row cap reflows as sizes or ordering change.
