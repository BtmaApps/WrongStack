## Verify on disk before verdicts

- [applied 3×, 3 ok] When a diff retargets test imports across packages (`packages/core/tests/**` → `packages/agent-catalog/src/**`), `glob` each new target under the destination `src/` before any verdict — a typo'd or unmoved path fails at collection, not as a subtle defect.
- [applied 3×, 3 ok] Resolve `ALLOWED` sets and `INJECTION_SITES` arrays against the filesystem, never the diff hunk: they match exact relative paths, so a stale entry is a silent no-op. Grep the module for the guarded symbol (e.g. `formatProjectSuppliedBlock`) to confirm each enumerated site still calls it.
- Ground every allegation on disk: confirm cited symbols still sit at the cited path (e.g. `escapeClosesPanels(event)` at `packages/vibeui/src/components/workspace.tsx:150`), and grep the owning package's `tests/` before alleging missing coverage (`GRAPH_HUB_DEGREE`, `traverseSqliteGraph`).
- Gate the verdict on `git status -- <target paths>` plus `rg` for the feature identifier (e.g. `selectionMode`): no implementation + `aborted_by_parent` ⇒ request changes; code present but unverified ⇒ needs verification, never all-clear.

## Cross-package wiring

- For new WS routes, add a handler under `packages/webui-server/src/server/` (e.g. `memory-doctor-handler.ts`) and put client methods in `packages/webui/src/lib/ws-client-actions.ts`, never `packages/webui-protocol/src/client-integrations.ts`.
- New i18n keys must land in all seven locales, including `src/i18n/locales/tr/activity.json`.

## Conventions

- Treat `pnpm-workspace.yaml` `overrides:` as authoritative; root `package.json` `overrides` is inert. Attribute lockfile references by importer block.
- Before removing `architecture/test-only-exports.json` entries, grep for static imports; dynamic access does not count.

## Race hot spots

- Trace rejection/submission races through `request(...)` in `packages/vibeui/src/lib/use-panel-requests.ts`: it resolves `null`, dedupes by frame type, cancels via `[state.id, connection]`.
- For `mailbox.send`, require every branch of `validateMailboxSendPayload` (`packages/webui-server/src/server/ws-mailbox-validation.ts`) covered, and a `mailbox.sent` reply carrying `requestId` and `success`.
- For `SessionSwitch` (`packages/vibeui/src/lib/session-switch.ts`), verify `settle`/`cancel`/timeout each release target, lock, timer, and `held` together.
