## Proven invariants

- Don't flag the sandbox-gate asymmetry: a pass condition of `mode === 'off'` (deny everything else) is intentional fail-closed hardening versus the exec wrapper's `mode !== 'enforced'`. Confirm against the `SandboxMode` union (`packages/core/src/sandbox/types.ts`) and the pinning tests (`packages/core/tests/sandbox/mcp-gate.test.ts`) before flagging. [3/3 ok]
- In `packages/mcp/src/transport-sse.ts`, `close()` aborts but does not replace `this.abortController`, so `this.abortController === controller` identity checks stay valid after close. Before flagging or approving, verify stale async paths (`readSSEBody` finally, SSE callbacks) skip shared cleanup — `streamSignal`, `rejectStreamPending`, state transitions — when identity fails, or they clobber the newer connection's state. [2/2 ok]

## Verification method

- Anchor findings in live files, not bundle context or cached reads. For docs-only revisions whose citations are load-bearing, read the changed file's full live range in the first batch — recovery logs re-collapse the same middle.
- If `read` elides a middle (`[artifact middle omitted]`) and rejects re-reads as "unchanged", read the log under `~/.wrongstack/tool-output/…-read-….log` directly (`read` accepts paths outside the root) or single-anchor `grep` with `context_lines` 40+.
- Name uncovered `file:line` ranges and set `completion: "partial"` — never an all-clear. Emit ```json { "findings": [] }``` only when verification is complete and clean.

## Cross-file invariants

- Marker needles in `packages/bench/src/transcript-mine.ts` feed raw `serialise(...).includes(...)` in `retrievalPassed`/`matchesRecall` (`packages/bench/src/trace-eval.ts`): require verbatim or identically JSON-escaped needles; check `conciseMarker`/`JSON.stringify` for whitespace collapse and unescaped quotes/newlines.
- `[agentId, id]` joins vs `SessionEventAttribution` (`packages/core/src/types/session-events.ts`) are per-writer: absent `agentId` (actor `''`) degrades symmetrically to plain id matching — don't flag it alone as dropped events.
- Before flagging `discoverOpenAICompatibleModels` (`packages/providers/src/auto-discover.ts`), compare its error-code regex with `oauthFailure` (`packages/providers/src/oauth/http.ts`): `/^[a-z0-9_.-]{1,100}$/i` over `body.error` — require byte-identical regexes and code-first, HTTP-status-second test ordering.

## Config and architecture

- Don't call a Vitest `exclude` allowlist dead without reading `exclude:` in `vitest.config.ts` and checking whether `packages/webui/**` remains — exclusions are additive with no negative globs, so subtree exclusions hold once the broad entry is removed.
- Require regeneration with any edit to `architecture/hotspots.json`; validate via `validateHotspotBaseline` (`scripts/lib/architecture-health.mjs`). Flag `lines`/`relativeImports` drift at or above `thresholdLines` (800), missing qualifying files, and entries below 800; ignore tail-row reflow in the fixed 50-row table (`docs/reports/architecture-health-current.md`).
