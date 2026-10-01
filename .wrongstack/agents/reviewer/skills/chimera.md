## Bench

- `counterSum`/`finiteSum` splits (`packages/bench/src/aggregate.ts`): integer counters take the `Number.isSafeInteger && >= 0` filter; continuous telemetry (cost, tokens) stays finite-only — a float on the integer variant silently reads 0. Call the rename complete only when the old module-private name has no surviving references. [3× ok]
- `StringDecoder.write()` replacing `chunk.toString('utf8')` in a byte-capped capture (`packages/bench/src/exec-command.ts`): require the flush guarded by `!truncated` (no `U+FFFD` on a mid-sequence cut), the walk-back still detecting cuts when the decoder holds a prior-chunk prefix, and `NaN`/`Infinity` rejected before `remaining`. The flush guard is the realistic miss. [1×]
- `inside()` (`packages/bench/src/graders/restore-files.ts`): before trusting or flagging the walk-up guard, require non-`ENOENT` errno to fail closed, every `ENOENT` probe `lstat`-checked for dangling symlinks, the walk ending at `rootAbs`, and containment computed against `fs.realpath(root)` — never the lexical root, or symlinked CI workdirs (`/tmp` → `/private/tmp`) false-reject. [1×]

## WebUI: the diff is not the contract

Touched files are not the contract; verify the live siblings on disk before clearing.

- Locale diffs: run `glob packages/webui/src/i18n/locales/*/settings.json` plus `grep <newNamespace>` — every locale dir needs the identical key set with matching `{{placeholder}}` tokens, consumed by the sibling (e.g. `FallbackSuggestionsPanel.tsx` reading `settings:fallbackSuggest.*`). [1×]
- A diff mounting a sibling that issues a WS request on mount: check the component on disk, every passed prop against its interface (exact callback arities), and the seam — `suggestFallbacks` in `packages/webui/src/lib/ws-client-domain-methods.ts` plus the message type in `packages/webui/src/types/server-message.ts`. Unconditional mount + dead method = runtime break; a mismatched callback fails silently. [1×]
- Cross-package source-pin regex updates (e.g. `packages/webui/tests/lib/kanban-board-active.test.ts` pinning `packages/webui-server/src/server/kanban-route-pagination.ts`): grep the twin for the exact new literal AND prove the old regex can no longer match — both matching is a vacuous pin; neither means the test guards nothing. [1×]

## Silent-failure patterns

- A new optional numeric field on a per-row result (e.g. `SearchHit.bm25` in `packages/sage/src/sqlite-store-search.ts`): its backing array (`const finalBm25 = rows.map(...)`) must be initialized on every branch, not just the targeted FTS path — the plain channel throws a TDZ `ReferenceError`. [3× ok]
- `packages/tools/src/**` diffs wiring `.gitignore` filtering: verify `packages/tools/src/codebase-index/gitignore.ts` — `loadGitignoreMatcher(root)` reads only the project-root `.gitignore` (no nested files, no `.git` requirement), returns `(relPath: string, isDir: boolean) => boolean`, last-match-wins `!` negation, trailing-slash dir-only. "Same file set as rg" holds only where ripgrep itself honors `.gitignore`; trust the enumerator's `require_git`, not the parity comment. [2× ok]

Report a clean check as `json { "findings": [] }` — only after running the checks above.
