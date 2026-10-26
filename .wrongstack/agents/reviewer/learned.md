# Learned instructions for `reviewer`

> Project-specific learning data for the `reviewer` agent. Each entry is a directive — read it as an instruction, not a journal entry. Entries are re-derived on every capture, so this file is always a current, structured snapshot of what this agent has learned.

## What to avoid

<!-- learned-stamp: category=warning; capturedAt=2026-10-25T16:46:07.508Z; skill=testing; skipped=66; skippedWins=66 -->
- **- For TUI animation tests in `packages/tui/tests/`, treat `vi.waitFor(..., { timeout, interval })` combined with a `vi.spyOn(Date, 'now')` frozen clock as the established anti-flake pattern (see `banner-formation.test.tsx`): the spy leaves real timers free to drive Ink repaints and waitFor polling, so fixed-ms `settle()` waits are the flaky construct — judge frame determinism from the mocked clock value, not wall-clock time, and do not flag the waitFor form as a hang risk.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `packages/tui/tests/`
  - *How:* `vi.waitFor(..., { timeout, interval })`
  - *How:* `vi.spyOn(Date, 'now')`
  - *How:* `banner-formation.test.tsx`
  - *How:* `settle()`

<!-- learned-stamp: category=warning; capturedAt=2026-10-25T08:16:47.556Z; skill=chimera; applied=5; wins=5; skipped=76; skippedWins=76 -->
- **When reviewing `@wrongstack/*` package.json version bumps, first confirm dependents use `workspace:*` specifiers via a grep of `**/package.json` — this repo does (all 77 declarations), so internal version bumps are metadata-only and cannot break resolution, lockfile specifiers, or `--frozen-lockfile` installs. Also confirm `private: true`, which removes publish-side risk.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `@wrongstack/*`
  - *How:* `workspace:*`
  - *How:* `**/package.json`
  - *How:* `--frozen-lockfile`
  - *How:* `private: true`

<!-- learned-stamp: category=warning; capturedAt=2026-10-25T09:26:00.819Z; skill=code-review; skipped=67; skippedWins=67 -->
- **When reviewing trigger-based change detection in `packages/sage/src/sqlite-store-hq-sync.ts`, check whether `$.updatedAt` is stripped from the `changed()` helper before judging any metadata key's strip list. Because `applySemanticChange` (`packages/sage/src/shared/semantic-rewrite.ts`) always bumps `updatedAt`, every edit path that moves `updatedAt` still satisfies `changed(new) IS NOT changed(old)` and still replicates — so stripping a metadata key only matters for raw SQL paths that mutate `data` without `updatedAt` (e.g. `stampSqliteVerification` in `packages/sage/src/sqlite-store-verification-stamp.ts`), and it never suppresses a legitimate replication.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `packages/sage/src/sqlite-store-hq-sync.ts`
  - *How:* `$.updatedAt`
  - *How:* `changed()`
  - *How:* `applySemanticChange`
  - *How:* `packages/sage/src/shared/semantic-rewrite.ts`
  - *How:* `updatedAt`
  - *How:* `changed(new) IS NOT changed(old)`
  - *How:* `data`
  - *How:* `stampSqliteVerification`
  - *How:* `packages/sage/src/sqlite-store-verification-stamp.ts`

## What to do

<!-- learned-stamp: category=convention; capturedAt=2026-10-25T21:25:00.573Z; skill=chimera; applied=2; wins=2; skipped=16; skippedWins=16 -->
- **Always re-read the changed file on disk before citing a type mismatch from a supplied diff — the diff hunk may show `sessionId: undefined` assigned to a `sessionId: string` field while the working tree already widens it to `string | undefined`; report the on-disk state, not the snapshot.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `sessionId: undefined`
  - *How:* `sessionId: string`
  - *How:* `string | undefined`

<!-- learned-stamp: category=convention; capturedAt=2026-10-25T21:03:32.097Z; applied=19; wins=19; skipped=8; skippedWins=8 -->
- **Always verify that a change claiming to remove an aggregate/global leak actually removes it from the emitted payload — a projection helper that deletes aggregate keys is useless if the handler re-reads the raw message fields alongside it. Check the response body construction, not just the helper call (see `packages/webui-server/src/server/mailbox-handlers.ts` and `packages/coordination/src/mailbox-http-actor-query.ts`). When a diff replaces a bounded store-level count with an actor-scoped helper, check the helper's internal query limit before accepting the swap — `unreadCountForActor` in `packages/coordination/src/mailbox-http-actor-query.ts` uses `limit: Number.MAX_SAFE_INTEGER` and fans out per recipient, so any caller on a poll path (TUI client status, ACP turn reminders) turns a SQL-bounded count into a full mailbox materialization. When a shared canonical predicate is introduced for a concept that previously had divergent inline copies (here "unread"), grep the changed file for the remaining inline copies before accepting the change — introducing the helper without migrating the sites in the same diff leaves the drift the helper was meant to remove (active task H5 remained unsatisfied).**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `packages/webui-server/src/server/mailbox-handlers.ts`
  - *How:* `packages/coordination/src/mailbox-http-actor-query.ts`
  - *How:* `unreadCountForActor`
  - *How:* `limit: Number.MAX_SAFE_INTEGER`

## Patterns to follow

<!-- learned-stamp: category=pattern; capturedAt=2026-10-25T21:20:11.946Z; skill=code-review; applied=3; wins=3; skipped=17; skippedWins=17 -->
- **When a CLI or surface sends to a multi-recipient target (`*`), apply the shared send-type validator to that branch too — not only to the direct-recipient branch. The storage boundary throws for `assign`/`steer` to `*` (`packages/coordination/src/sqlite-mailbox.ts`), and because `RemoteMailbox.send` goes over the IPC socket (`packages/coordination/src/remote-mailbox.ts`), the server's `ok: false` response rejects the client promise. Any branch that calls `mb.send()` without its own try/catch surfaces a raw IPC error instead of a validation message. Check every `mb.send(` call site for a `try/catch`, not just the one the diff touched.**
  - *Why:* This project's chosen approach — alternatives were considered and either conflict with existing architecture or were rejected for known reasons.
  - *How:* `*`
  - *How:* `assign`
  - *How:* `steer`
  - *How:* `packages/coordination/src/sqlite-mailbox.ts`
  - *How:* `RemoteMailbox.send`
  - *How:* `packages/coordination/src/remote-mailbox.ts`
  - *How:* `ok: false`
  - *How:* `mb.send()`
  - *How:* `mb.send(`
  - *How:* `try/catch`

---
*Last capture: 2026-10-25T21:25:00.573Z · 6 entries*
