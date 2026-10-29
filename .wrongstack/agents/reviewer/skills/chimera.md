## Proven checks

- [applied 5×, 5 ok] Before flagging risk on `@wrongstack/*` version bumps, grep `**/package.json` to confirm dependents use `workspace:*` and packages carry `private: true`. When both hold, the bump is metadata-only — it cannot break resolution, lockfile specifiers, or `--frozen-lockfile` installs — so don't invent lockfile or publish-side findings.
- [applied 3×, 3 ok] Re-read the changed file on disk before citing a type mismatch from a supplied diff; hunks lag the tree (one showed `sessionId: undefined` against a `sessionId: string` field the working tree already widens to `string | undefined`). Report the on-disk state, not the snapshot.

## Working-tree grounding

- Resolve `ALLOWED` sets and `INJECTION_SITES` arrays against the filesystem, not hunks: `rg` each referenced module for its guarded symbol (e.g. `formatProjectSuppliedBlock`) to confirm the site still invokes it — stale entries are silent no-ops. When test imports move (`packages/core/tests/**` → `packages/agent-catalog/src/**`), glob the destination `src/` to confirm targets exist before an all-clear.
- Ground each allegation at its cited path and symbol (e.g. `escapeClosesPanels(event)` at `packages/vibeui/src/components/workspace.tsx:150`); search the owning package's `tests/` before alleging missing coverage of identifiers like `GRAPH_HUB_DEGREE` or `traverseSqliteGraph`.
- Before the verdict, run `git status -- <target paths>` and `rg` the feature identifier (e.g. `selectionMode`): absent while `aborted_by_parent` is in play → request changes; present but unverified → require verification, not all-clear.

## Workspace facts

- Treat `pnpm-workspace.yaml` `overrides:` as authoritative; root `package.json` `overrides` is inert. Attribute lockfile references by importer block.

## Wiring conventions

- Put new WS route handlers under `packages/webui-server/src/server/` (e.g. `memory-doctor-handler.ts`) and client methods in `packages/webui/src/lib/ws-client-actions.ts` — never `packages/webui-protocol/src/client-integrations.ts`.
- Add i18n keys to all seven locales, including `src/i18n/locales/tr/activity.json`.
- Before removing `architecture/test-only-exports.json` entries, search for static imports; dynamic access does not count.

## Race hot spots

- Trace panel rejection/submission races through `request(...)` in `packages/vibeui/src/lib/use-panel-requests.ts` — it resolves `null`, dedupes by frame type, and cancels via `[state.id, connection]`.
- For `mailbox.send`, cover every branch of `validateMailboxSendPayload` (`packages/webui-server/src/server/ws-mailbox-validation.ts`) and require a `mailbox.sent` reply carrying `requestId` and `success`.
- For `SessionSwitch` (`packages/vibeui/src/lib/session-switch.ts`), `settle`, `cancel`, and timeout must each release target, lock, timer, and `held` together.
