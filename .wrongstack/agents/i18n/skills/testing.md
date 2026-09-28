## Commands

- Run `pnpm -C packages/webui exec vitest run tests/i18n/catalog-integrity.test.ts` as the baseline audit.
- For `activity.json` changes, pair the baseline with a throwaway flatten-and-compare script under `packages/webui/.temp_files/`; check `{{placeholder}}` parity, en-identical values, and locale-appropriate `_one` / `_other` / `_few` shapes. Keep it ephemeral and do not move this exploratory logic into `tests/i18n/`.
- Restrict flatten-and-compare findings to the changed key set; the existing en-identical backlog is not actionable for the current change.
- Delete the temporary script after use. If the leader’s bulk-delete gate denies deletion, do not retry via `bash` or `node rmSync`; list the exact leftover files for leader removal.

## Conventions

- Resolve catalogs using `packages/webui/src/i18n/locales/<locale>/<namespace>.json`. Derive namespaces from one locale directory’s `.json` files—never from locale directory names.
- Keep manual dangling-reference scans plural-aware: exclude `workspaceCount_one` / `workspaceCount_other` when a bare `t('activity:techStack.workspaceCount')` is valid. The baseline already checks runtime plural resolution.
- Treat a reference missing from every locale as user-visible raw-key output: `packages/webui/src/i18n/index.ts` configures `fallbackLng`, but no `parseMissingKeyHandler` or `saveMissing`.
- For a flat count key without plural variants, inspect the call site before assigning severity. Flag `t(key, { count })`—for example, `ContextBreakdownModal.tsx` passing `count:`—because it can render “1 tools”; do not equate harmless `{ total }` or `{ tokens }` interpolation with missing plurals.
- Check changed activity messages for flat `{{count}}` carrying plural English phrasing and count-plus-label JSX such as `{n} {t('ns:key')}`, which can render “1 items” or “1 snapshots”.
- Split en-identical findings by severity: report sentence-shaped unchanged values as hard gaps, but label genuine cross-language loanwords such as `tokens` or `mode` as translator-confirm items rather than false-positive untranslated strings.
