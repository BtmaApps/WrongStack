## `.wrongstack/` fixtures

- Before editing any file under `.wrongstack/project-kit/<kit>/fixtures/`, read the sibling `<kit>/kit.json` verification cases first — the kit runner copies `fixtures/` wholesale to a scratch dir and pins exact properties (`bytes: 13` per file, `scanned: 5` per directory), so a harmless-looking edit breaks kit verification with zero code references to warn you. `[6×, 6 ok]`
- The index never covers gitignored `.wrongstack/`: empty `codebase-search`/`codebase-context` results there are expected, not proof of no consumers — the only tracer for a fixture is a repo-wide basename grep.

## Tracing importers and consumers

- Settle "who imports this file" with one repo-wide `files_with_matches` grep for `name(\.js)?['"]`; an untruncated hit list is exhaustive, re-export and test lines included. For Vitest files under `packages/*/tests/` it is the only method — tests export nothing for `codebase-incoming-calls` to query, and a zero-match grep proves the test runner is the sole consumer (a test's real coupling surface is its own imports: `../src/*`, `tests/helpers/`). `[5×, 5 ok]`
- Widen directory modules to `name(/index)?(\.js)?['"]` — the plain pattern misses `../src/<name>/index.js`.
- Never grep a bare component or short name: `DependencyDetail` alone yields 21+ false hits from locale keys like `missingDependencyDetail`, and `jev`/`council` match tool registries and enum values. Grep WebUI components as `from ['"].*ComponentName['"]|import\(.*ComponentName`; for short names, grep a distinctive export (`buildJevCommand` from `packages/cli/src/slash-commands/jev.ts`) or anchor to `from ['"].*/name(\.js)?['"]`.
- For symbols crossing a re-exporter (`packages/tui/src/theme.ts` re-exports `themePresets` from `theme-presets.ts`), grep the module basename and classify hits by import lines: direct importers vs re-export consumers.
- Use `codebase-incoming-calls` only to corroborate — one query per symbol, and it can misattribute shared-line import rows — though it catches deep relative imports the grep misses. On "symbol exists in multiple files", grep the symbol repo-wide before attributing callers: `packages/sage/src` holds a real twin (`decodePageCursor`/`PageCursor` in both `sqlite-store-pagination.ts` and `shared/pagination.ts`). `[3×, 3 ok]`

## Sage storage

- Treat `SqliteSageStore` in `packages/sage/src/sqlite-store.ts` as a deprecated facade: route sage-storage work through `packages/sage/src/memory-port.ts` (`createSqliteMemoryPort`; `SqliteMemoryPort` extends it) or the `sqlite-store-<area>.ts` siblings with the real logic. `packages/core/tests/architecture/memory-port-boundary.test.ts` regex-forbids `new SqliteSageStore(` outside the port layer — never construct it in another package; map external consumers via `@wrongstack/sage` barrel symbols (`SqliteMemoryPort`, `createProjectSageMemoryPort`, `isSqliteAvailable`). `[1×, 1 ok]`

## WebUI i18n

- Locale JSONs (`packages/webui/src/i18n/locales/<lng>/<ns>.json`) have no call-graph edges — `packages/webui/src/i18n/index.ts` loads them via the dynamic import ``import(`./locales/${lng}/${ns}.json`)``. Grep the locales tree for `<ns>.json`; consumers are exactly three: that backend, `packages/webui/tests/i18n/catalog-integrity.test.ts`, and `scripts/check-i18n-completeness.mjs` (`npm run lint:i18n`). `{{var}}` placeholder parity in translated values is unguarded — check by hand.
- Count namespace usage with ``t\(['"\`]activity:```, not `useTranslation\(['"]activity` — components use `useAppTranslation` and address keys as `t('ns:key')`; run `count` for totals plus `files_with_matches` for the exhaustive file set (`count` truncates).
