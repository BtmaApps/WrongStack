## Bench

- For `counterSum` versus `finiteSum` in `packages/bench/src/aggregate.ts`, route integer counters only through `counterSum` (`Number.isSafeInteger && >= 0`) and continuous telemetry such as cost or tokens only through finite-only `finiteSum`; floats on the integer path silently read as `0`. Before accepting the rename, confirm the old module-private helper has no surviving references. [3×, 3 ok]
- Initialize new optional per-row numeric fields on every branch, not only the targeted search path. In particular, verify the backing array for fields such as `SearchHit.bm25` in `packages/sage/src/sqlite-store-search.ts`; a missing plain-channel initialization causes a TDZ `ReferenceError`. [3×, 3 ok]
- For `packages/tools/src/**` changes involving ignore filtering, audit `packages/tools/src/codebase-index/gitignore.ts`: `loadGitignoreMatcher(root)` reads only the project-root `.gitignore`, requires no nested files or `.git`, and returns `(relPath: string, isDir: boolean) => boolean` with last-match-wins `!` negation and trailing-slash directory-only matching. Trust `require_git` rather than any claim of unconditional parity with `rg`. [2×, 2 ok]
- When `StringDecoder.write()` replaces `chunk.toString('utf8')` in a byte-capped path such as `packages/bench/src/exec-command.ts`, require the completion flush to be guarded by `!truncated`, verify walk-back still detects cuts when the decoder retains a previous-chunk prefix, and reject `NaN`/`Infinity` before values reach `remaining`. Missing `!truncated` is the realistic defect. [1×, 1 ok]
- Before trusting or flagging `inside()` in `packages/bench/src/graders/restore-files.ts`, verify non-`ENOENT` errors fail closed, every `ENOENT` probe is `lstat`-checked for dangling symlinks, the walk terminates at `rootAbs`, and containment compares against `fs.realpath(root)`, not the lexical root. The latter avoids false rejection for symlinked CI paths such as `/tmp` → `/private/tmp`. [1×, 1 ok]

## WebUI: verify the live contract

- For locale-string diffs, run `glob packages/webui/src/i18n/locales/*/settings.json` and `grep <newNamespace>`. Require every locale directory to have the identical key set and matching `{{placeholder}}` tokens, and confirm the sibling consumer, such as `FallbackSuggestionsPanel.tsx` using `settings:fallbackSuggest.*`. [1×, 1 ok]
- For a component mounted on disk that requests over WS, check every passed prop against its interface and exact callback arities. Verify `suggestFallbacks` in `packages/webui/src/lib/ws-client-domain-methods.ts` and its message type in the `packages/webui/src/types/server-message.ts` union; unconditional mounting exposes dead methods as runtime failures. [1×, 1 ok]
- For cross-package source pins such as `packages/webui/tests/lib/kanban-board-active.test.ts`, grep the exact new literal in `packages/webui-server/src/server/kanban-route-pagination.ts` and prove the old regex no longer matches. Both matching is vacuous; neither matching leaves the test unguarded. [1×, 1 ok]

## Result

- Only after all applicable checks above, report a clean result as `json { "findings": [] }`.
