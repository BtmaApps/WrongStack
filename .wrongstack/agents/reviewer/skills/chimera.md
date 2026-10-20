## Verify before verdict

- Resolve Chimera citations against files on disk, not only the handed-off diff. In particular, verify `escapeClosesPanels(event)` at `packages/vibeui/src/components/workspace.tsx:150` before alleging an unused import or broken test.
- Run `git status -- <target paths>` and `rg` for feature identifiers such as `selectionMode`. If both show no implementation and the task is `aborted_by_parent`, return request changes; use needs verification only when code exists but remains unchecked.
- Before reporting missing regression coverage for exports such as `GRAPH_HUB_DEGREE` or `traverseSqliteGraph`, grep the owning package’s `tests/` directory and trace any existing expectations against the implementation.
- Confirm every out-of-bundle dependency: new WS routes need handlers under `packages/webui-server/src/server/` such as `memory-doctor-handler.ts`; client methods belong in `packages/webui/src/lib/ws-client-actions.ts`, not `packages/webui-protocol/src/client-integrations.ts`; new i18n keys must exist in all seven locales, including `src/i18n/locales/tr/activity.json`.
- When `grep` reports `count=N` but renders only a few groups, inspect `C:\Users\ersin\.wrongstack\tool-output\` or re-read the file with explicit `offset`/`limit` windows.

## vibeui

- Trace `request(...)` through `packages/vibeui/src/lib/use-panel-requests.ts` before flagging rejection or submission races: it resolves `null`, deduplicates by frame type, and cancels via `[state.id, connection]`.
- For `mailbox.send`, check all branches of `validateMailboxSendPayload` in `packages/webui-server/src/server/ws-mailbox-validation.ts` and require a `mailbox.sent` reply with `requestId` and `success`.
- For `SessionSwitch` in `packages/vibeui/src/lib/session-switch.ts`, ensure `settle`, `cancel`, and timeout release target, lock, timer, and `held` together.
- Resolve styling refactors at the component and stylesheet layers. Pair `.site-section--short` with `.site-section`; when `.source-preview` loses `overflow`/`max-height`, verify replacement containment such as `.code-panel pre` in `packages/vibeui/src/app/globals.css`.

## Repository conventions

- For `SettingsPickerValues`, find stale fixtures by grepping `packages/tui/tests` for sibling keys such as `toolResultViewMode`; count the `SETTINGS_DEFAULTS` literal in `packages/tui/src/components/settings-picker-model.ts`.
- Treat `pnpm-workspace.yaml` `overrides:` as authoritative; root `package.json` `overrides` is inert. Attribute lockfile references by importer block.
- Before removing `architecture/test-only-exports.json` entries, grep for static imports; dynamic access does not count.
- Return `{"findings": []}` only after all applicable checks pass.
