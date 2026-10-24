## Verify on disk before verdicts

- [applied 3×, 3 ok] When test imports move across packages (`packages/core/tests/**` → `packages/agent-catalog/src/**`), use `glob` over the destination `src/` to verify every target exists before declaring all-clear; typo’d or unmoved paths fail at collection. Resolve `ALLOWED` sets and `INJECTION_SITES` arrays against the filesystem, not diff hunks, because paths match exactly and stale entries can become silent no-ops. `rg` each referenced module for the guarded symbol (e.g. `formatProjectSuppliedBlock`) to confirm the enumerated site still invokes the helper.
- Ground every allegation at its cited path and symbol, such as `escapeClosesPanels(event)` at `packages/vibeui/src/components/workspace.tsx:150`. Search the owning package’s `tests/` before alleging missing coverage for identifiers such as `GRAPH_HUB_DEGREE` or `traverseSqliteGraph`.
- Check `git status -- <target paths>` and `rg` the feature identifier, such as `selectionMode`, before the verdict. If implementation is absent and `aborted_by_parent` applies, request changes; if present but unverified, require verification rather than all-clear.

## Cross-package wiring

- Put new WS route handlers under `packages/webui-server/src/server/` (e.g. `memory-doctor-handler.ts`) and client methods in `packages/webui/src/lib/ws-client-actions.ts`, never `packages/webui-protocol/src/client-integrations.ts`.
- Add new i18n keys to all seven locales, including `src/i18n/locales/tr/activity.json`.

## Conventions

- Treat `pnpm-workspace.yaml` `overrides:` as authoritative; root `package.json` `overrides` is inert. Attribute lockfile references by importer block.
- Before removing `architecture/test-only-exports.json` entries, search for static imports; dynamic access does not count.

## Race hot spots

- Trace panel rejection/submission races through `request(...)` in `packages/vibeui/src/lib/use-panel-requests.ts`: it resolves `null`, dedupes by frame type, and cancels via `[state.id, connection]`.
- For `mailbox.send`, cover every branch of `validateMailboxSendPayload` (`packages/webui-server/src/server/ws-mailbox-validation.ts`) and require a `mailbox.sent` reply containing `requestId` and `success`.
- For `SessionSwitch` (`packages/vibeui/src/lib/session-switch.ts`), verify `settle`, `cancel`, and timeout each release the target, lock, timer, and `held` together.
