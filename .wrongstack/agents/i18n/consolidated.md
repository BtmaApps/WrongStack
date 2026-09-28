## Audit Workflow

- Run `pnpm -C packages/webui exec vitest run tests/i18n/catalog-integrity.test.ts` before any custom comparison. Read the complete missing-key list first; for add-only English changes, it identifies the exact key set missing from each locale.
- Restore key parity before running placeholder or English-identity comparisons. Those checks are unreliable while non-English catalogs still lack the keys.
- Once parity exists, pair the baseline with a throwaway flatten-and-compare script under `packages/webui/.temp_files/`. Check `{{placeholder}}` parity, English-identical values, and count/plural key shapes that the baseline does not fully validate.
- Restrict flatten-and-compare output to the changed key set before reporting. The repository-wide backlog of English-identical values is not actionable for a change-specific audit.
- For dangling references on new features, compare the `t()` spelling with the keys actually added to the catalogs before renaming anything; key-name drift is usually resolved by adding the intended key rather than renaming an existing translation.
- Re-read the target source and locale lines immediately before reporting so conclusions reflect the latest working-tree state.

## Validation and Reporting

- Treat `tests/i18n/catalog-integrity.test.ts` as authoritative for key parity, empty strings, dangling `t()` references, and translator wiring. It is plural-aware: a bare reference such as `t('activity:techStack.workspaceCount')` may correctly resolve to `workspaceCount_one` and `workspaceCount_other`.
- Custom dangling-reference scanners must recognize plural-suffixed keys rather than reporting `_one`, `_other`, and related suffixes as orphaned.
- Split English-identical findings into two confidence levels:
  - Hard gaps: complete sentences or clearly untranslated prose that matches English.
  - Translator-confirm items: shared words or loanwords such as `tokens` and `mode` that may be valid translations.
- Before assigning severity to a count-related catalog issue, inspect the call site. Passing `{ count }` triggers i18next plural selection; interpolations such as `{ total }` or `{ tokens }` do not.
- Re-read active catalogs before finalizing audit results because another process may modify them during the review.

## Translation and Code Conventions

- Pass the complete countable phrase to i18next with `t(key, { count })` and provide `_one`/`_other` variants for agreement-sensitive text. Do not split the number and noun into adjacent JSX such as `{n} {t('ns:key')}`, which can produce output like `1 snapshots` and prevents translator inflection.
- In `packages/webui` with i18next `^26`, `t(key, { count })` falls back to a flat key when plural variants are absent. A flat key is acceptable only for count-agnostic text such as `Review ({{count}})`; use `_one`/`_other` for labels requiring grammatical agreement.
- Flag flat keys containing `{{count}}` when English phrasing is plural, because a value such as `{{count}} items` can render as `1 items`.
- Never use printf-style escaping for literal percent signs in i18next catalogs. `%%` renders literally, not as `%`; use a bare `%`, or the established interpolation form `(%{{pct}})` rather than malformed forms such as `%%%{{pct}}`.
- Calibrate new translations against semantically adjacent keys in the same target locale and reuse their terminology, gender, and agreement rather than translating literally. For example, preserve established `memoryManager` terms such as German `eingefügt` instead of `injiziert`, Turkish `eklendi`/`Bağlayıcılar`, and the feminine status wording used by the Spanish, French, Italian, and Brazilian Portuguese catalogs.
- WebUI `sidePanel.*` description keys must match the `Activity` union (`'chat' | 'agents' | 'files' | 'changes' | 'mailbox' | 'skills' | 'design'`) in `packages/webui/src/stores/ui-store-types.ts`. The dynamic lookup in `packages/webui/src/components/SidePanel/index.tsx` uses the flat key ``t(`activity:sidePanel.${activeActivity}`)`` with no `desc.*` nesting.
- Type translator props as `(key: string, opts?: Record<string, unknown>) => string` so catalog-integrity recognizes them as translators. Avoid `t: any` and bare untyped destructuring.

## Project Facts

- WebUI catalogs use `packages/webui/src/i18n/locales/<locale>/<namespace>.json`. Shipped locale directories include `de`, `en`, `es`, `fr`, `it`, `pt-BR`, and `tr`; namespaces include `activity`, `settings`, `setup`, `chat`, `commandPalette`, and `toasts`.
- Derive namespaces from the `.json` filenames in one locale directory; do not treat locale directories as namespaces when constructing audit scripts.
- `packages/webui/src/i18n/index.ts` configures `fallbackLng` but no `parseMissingKeyHandler` or `saveMissing`. A `t()` reference missing from every locale therefore renders the raw key path to users.

## Tooling Constraints

- If `read` suppresses a locale JSON re-read as “unchanged since previous read,” even with a fresh `offset`, stop retrying the same read. Use `grep` with a line-anchored pattern such as `^ "` to retrieve the file content.
- On Windows paths, use `**/activity.json` or a direct locale-file path; the single-star form `*/activity.json` can silently match nothing. Treat zero matches as suspect when the file is known to exist.
- Do not assume higher `count` or `limit` values will display more than roughly three grep content lines in this environment. Size each pattern to no more than three expected matches.
- Do not rely on Unix `tail` in the `bash` tool. Redirect long output to a project-local file and inspect it with targeted `grep`.
- For add-only locale JSON edits, anchor `edit` on a unique existing key line and append comma-terminated entries after it. If inserting after the object’s final key, add the required trailing comma to that previous key.
- Remove throwaway audit scripts after use. If deletion through `bash` or `node rmSync` is denied by the bulk-delete gate, do not retry; list the exact leftover files under `packages/webui/.temp_files/` in the final report for leader cleanup.