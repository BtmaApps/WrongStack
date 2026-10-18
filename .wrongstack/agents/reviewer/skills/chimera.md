## Verify before verdict

- Before reviewing claimed work, run `git status -- <target paths>` plus an `rg` for feature identifiers (e.g. `selectionMode`). If the result is `aborted_by_parent` with zero target-path changes and zero symbol matches, the verdict is `request changes` (deliverable absent). Reserve `needs verification` for code that is present but unchecked.
- For exhaustive usage checks in large files such as `packages/vibeui/src/lib/use-session.ts`, do not trust a single `grep` render. It reports `count=N` but may show only 3 groups. Before concluding that stale references are gone, either grep the saved log under `C:\Users\ersin\.wrongstack\tool-output\` or re-`read` with `offset` windows.

## vibeui

- Before flagging unhandled rejections or double-submits, trace `request(...)` call sites to `packages/vibeui/src/lib/use-panel-requests.ts`. It resolves `null`, dedupes by frame type, and cancels in-flight requests via `[state.id, connection]` cleanup. Sends guarded by `busy` that clear drafts with functional comparisons are race-safe.
- For new ws calls like `mailbox.send`:
  - Check fields against all 12 branches of `validateMailboxSendPayload` in `packages/webui-server/src/server/ws-mailbox-validation.ts`.
  - Confirm a `mailbox.sent` reply carrying `requestId` + `success`, so `acceptsPanelReply` matches.
- For `SessionSwitch` (`packages/vibeui/src/lib/session-switch.ts`), confirm every exit (`settle`, `cancel`, timeout) releases target, lock, timer and `held` together. A leaked `held` lets `cancel()` replay a stale `session.start`.

## tui

- When `SettingsPickerValues` (`packages/tui/src/settings-contracts.ts`) gains a required key:
  - Find missed fixtures by grepping `packages/tui/tests` for a sibling key like `toolResultViewMode`, not the new key.
  - Verify `Object.keys(SETTINGS_DEFAULTS).toHaveLength(N)` by counting the literal in `packages/tui/src/components/settings-picker-model.ts`, skipping comments.
- In `packages/tui/src/app-view.tsx`, treat the `localX` + `selectionSaveQueue` + `selectionSaveVersion` trio as intentional and race-safe. Do not flag superseded-save failures. Check `historyScrollRef` against `packages/tui/src/components/history/scroll-controller-types.ts`.

## Tools, dependencies, timers

- Browser:
  - `browserPrivateOrigins(root)` merges `/browser allow` with `WRONGSTACK_BROWSER_PRIVATE_ORIGINS`.
  - Accept "takes effect immediately" only after tracing the `managerFor` cache refresh in `packages/tools/src/browser/manager.ts`.
  - `timeoutMs` + `managesOwnTimeout: true` is the accepted convention.
- Lockfile: attribute surviving references by their owning importer block, never by line proximity. `pnpm-workspace.yaml` `overrides:` is authoritative; root `package.json` `overrides` is inert under pnpm.
- Before removing an entry from `architecture/test-only-exports.json`, grep for static imports. Dynamic access does not count.
- Env-configured timer durations must follow `Number.isFinite(x) && x >= min ? Math.min(x, 2_147_483_647) : DEFAULT`.
- For new `SessionEvent` literals (`packages/core/src/types/session-events.ts`), require one writer per surface and one fold per consumer. Replay and legacy branches must be mutually exclusive.

## Output

- Return `{"findings": []}` only after these checks pass.
