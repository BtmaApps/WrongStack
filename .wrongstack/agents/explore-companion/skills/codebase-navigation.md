## Consumer closure

- Never close "who uses X" with `codebase-incoming-calls` alone — it misses type-only imports, barrel-mediated imports, dynamic `await import(...)`, and same-name-symbol edges. Use a module-stem grep over `.js`/`.ts` specifier variants (`truncated=false`) plus a per-exported-symbol grep; read the package barrel for what it actually re-exports, confirming the barrel exists first (missing ≠ non-re-exporting). Zero-caller exports may already be ratcheted in `architecture/test-only-exports.json`.
- Proven shapes: `packages/sage/src/anchors/verify.ts` is public only as `verifyMemoryAnchors` via `packages/sage/src/index.ts:1` — its `anchorVerificationCoverage` seam runs via direct `../src/anchors/verify.js` and dynamic imports `[91× ok]`. `packages/telegram/src/index.ts` is the wiring hub — grep `new <Symbol>` sites (`new PollLock(...)`) and both specifier forms (`./poll-lock.js`, `../../src/poll-lock.js`) `[101× ok]`. `packages/mcp/src/client-stdio-protocol.ts` is internal-only (`MCPClient` is the barrel surface); value consumers are `packages/mcp/src/client.ts` (`onData`/`onLine`) and adapter factory `packages/mcp/src/client-hosts.ts` `[19× ok]`. `packages/sdd/src/sdd-task-recovery.ts` importers alias everything as `delegate*` — stem-grep, not call-graph `[7× ok]`.

## Duplicates

- Classify every symbol hit by import source before attribution: `slugify` lives in `packages/core/src/utils/slug.ts` plus namesakes in `packages/core/src/utils/wstack-paths.ts`, `packages/kanban/src/manager/basic-helpers.ts`, and `packages/core/scripts/build-prompts.mjs`. [applied 3×, 3 ok]
- In `packages/sage`, always grep sibling `sqlite-store-pagination` alongside `shared/pagination`: both export `decodePageCursor`/`PageCursor`, and the SQLite list path (`sqlite-store-list-page.ts:4`, `sqlite-store-coverage.ts:25`) imports the sibling's copy — `decodePageCursor`/`compareByUpdatedDesc`/`CONTEXT_STATUSES` have zero production importers from `shared/pagination`. [applied 5×, 5 ok]

## Alias-injected fixtures

- Expect zero static importers for `packages/simpleui/tests/app-smoke-fake-ws.js`: it is injected via Vite `resolve.alias` exact-string entries in `tests/app-browser-smoke.mjs` (`{ find: './ws.js' }`, `{ find: '../lib/ws.js' }`). Close the real consumer set by grepping the swapped specifier forms in `packages/simpleui/src`; the sole value import is `src/hooks/use-simple-socket.ts`, type-only imports are untouched. [applied 16×, 16 ok]

## Gitignored `.temp_files`

- The codebase index and rg skip `.temp_files`, so `codebase-search`/`codebase-incoming-calls` return nothing: map `.temp_files/proof-driven-bug-hunter/<round>/` scripts via direct `read`, `tree` of the round dir, and repo-wide grep of hardcoded needle strings (e.g. `SCRUBBED_FREE_TEXT_FIELDS` → `packages/core/tests/storage/session-scrub-parity.test.ts`). All needles absent from the target means the script already ran; re-runs fail closed. [applied 11×, 11 ok]
- A round dir holding only `RECOVERY-NOTE.md` is terminal — no `run.mjs` or `vitest.proof.config.mjs` to map; verify the note's claims by direct read/grep before relaying them. [applied 4×, 4 ok]

## Search targets

- Match quoted todo wording against `packages/core/skills/**/SKILL.md` first: `codebase-search` indexes skill `.md` bodies, and todo items are typically skill-step phrasings (`verify-before-done`, `evidence-audit`). [applied 5×, 5 ok]
- When verifying dependency removal, grep the human-readable brand name too (`Radix Select`, not just `@radix-ui/react-select`) — doc comments like `packages/webui-hq/src/components/ui/input.tsx:28-31` outlive the removed component.
