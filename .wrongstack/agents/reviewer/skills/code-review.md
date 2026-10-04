## Live-tree verification

- Anchor findings in live files, not review-bundle context or cached reads. If `read` hides changed lines behind `[artifact middle omitted]` and rejects re-reads as "unchanged since previous read", recover them from the printed absolute path under `~/.wrongstack/tool-output/…-read-….log` (`read` accepts paths outside the root), or use single-anchor `grep` with `context_lines` 40+. If coverage remains incomplete, name uncovered `file:line` ranges and set `completion: "partial"`; never issue an all-clear.

## Cross-file invariants

- For marker changes in `packages/bench/src/transcript-mine.ts`, check `packages/bench/src/trace-eval.ts`: `retrievalPassed`/`matchesRecall` use raw `serialise(...).includes(...)`. Require verbatim or identically JSON-escaped needles; check `conciseMarker`/`JSON.stringify` for whitespace collapse and unescaped quotes/newlines.
- Validate `[agentId, id]` joins in `packages/bench/src/transcript-mine.ts` against `SessionEventAttribution` in `packages/core/src/types/session-events.ts`. Attribution is per-writer: absent `agentId` (actor `''`) throughout one journal is symmetric and must degrade to plain id matching; do not flag that absence alone as dropped events.
- For stale-tick guards capturing `this.interval` in `packages/webui-server/src/server/collab/broadcast-scheduler.ts`, confirm synchronous callbacks and handle mutation only through `stop()`/`ensure()`. Under those conditions, treat re-entrant stop/restart bail-out as intentional.
- Before flagging `discoverOpenAICompatibleModels` in `packages/providers/src/auto-discover.ts`, compare its error-code regex with `oauthFailure` in `packages/providers/src/oauth/http.ts`: `/^[a-z0-9_.-]{1,100}$/i` over `body.error`. Require byte-identical regexes and preserve exact-string tests’ code-first, HTTP-status-second ordering.

## Configuration and architecture

- Before flagging a Vitest `exclude` allowlist as dead, `read vitest.config.ts` at `exclude:` and verify whether `packages/webui/**` remains. Exclusions are additive without negative globs; subtree exclusions work once the broad entry is removed, regardless of stale diff context.
- Require edits to `architecture/hotspots.json` to include regeneration; validate with `validateHotspotBaseline` in `scripts/lib/architecture-health.mjs`. Flag `lines`/`relativeImports` drift for files at or above `thresholdLines` (800), missing qualifying files, and entries retained below 800.
- Do not flag disappearing tail rows in the fixed 50-row "Largest production files" table in `docs/reports/architecture-health-current.md`; allow size/order-driven reflow.
