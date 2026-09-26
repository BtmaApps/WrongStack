## WebUI i18n

- Never resolve consumers of a locale JSON (`packages/webui/src/i18n/locales/<lng>/<ns>.json`) with `codebase-incoming-calls` — the backend loads it via the template-literal dynamic import `` import(`./locales/${lng}/${ns}.json`) `` in `packages/webui/src/i18n/index.ts`, invisible to the call graph. Grep the locales tree for `<ns>.json`; the consumer set is exactly three: that backend, `packages/webui/tests/i18n/catalog-integrity.test.ts`, and `scripts/check-i18n-completeness.mjs` (`npm run lint:i18n`).
- Blast radius of a locale edit: check key parity with `en` (missing and extra), the empty-string rule, and `{{var}}` placeholder parity in translated values by hand — placeholder parity has no automated guard.
- Count namespace usage (e.g. `activity` in `packages/webui/src`) with `` t\(['"\`]activity: ``, not `useTranslation\(['"]activity` — components use `useAppTranslation` and address keys as `t('ns:key')`, so hook greps return zero. Run `count` mode for totals and a `files_with_matches` companion for the exhaustive file set (`count` truncates the list).

## Import resolution

- Default for a file module (e.g. `packages/tui/src/components/status-bar-rails.tsx`): one repo-wide `files_with_matches` grep for `name(\.js)?['"]`. Re-export and test lines contain the specifier too; if untruncated, treat the hit list as exhaustive — no follow-up greps.
- For a WebUI component, grep `from ['"].*ComponentName['"]|import\(.*ComponentName`, never the bare basename — bare `DependencyDetail` returns 21+ false hits from locale keys like `missingDependencyDetail`.
- For short names that double as string literals (`jev`, `council`), `name(\.js)?['"]` matches tool registries and enum values. Grep a distinctive export instead (e.g. `buildJevCommand` from `packages/cli/src/slash-commands/jev.ts`), or anchor to `from ['"].*/name(\.js)?['"]`.
- For a directory module (`plugin-audit-catalog/index.ts`), widen to `name(/index)?(\.js)?['"]` — the plain pattern misses `../src/<name>/index.js` and returned zero hits for `packages/plugins/tests/plugin-audit-catalog.test.ts`.
- When a symbol crosses a re-exporter (`packages/tui/src/theme.ts` re-exports `themePresets` from `theme-presets.ts`), grep the module basename repo-wide and classify by import lines: only `theme.ts` imports `./theme-presets.js` directly in `packages/tui/src`; symbol-only users (`theme-preview.tsx`, five test files) are re-export consumers.
- Use `codebase-incoming-calls` only to corroborate: it needs one query per exported symbol and can attribute shared-line import rows to the wrong symbol. It does catch deep relative imports the specifier grep misses (the directory-module case).
