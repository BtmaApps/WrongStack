## Falsify Chimera “half-applied extraction” reports in `packages/webui`

- Before editing anything, falsify the report: run `node node_modules/typescript/bin/tsc --noEmit --pretty false -p packages/webui/tsconfig.json` and grep the flagged file for the supposedly deleted identifiers. Parallel workers routinely complete the wiring mid-session (e.g. `TechStackView/index.tsx` shrinking 808→773 lines while `AnalyzeControls.tsx`, `TrendsTab.tsx`, `RemediationTab.tsx` materialize untracked); citing the pre-fix snapshot produces false-positive “critical” findings.
- Treat a clean tsc for the flagged file as decisive even when the package exits 1 on an unrelated peer-modified file. Report that failure separately with its `file:line` — never patch it.

## Schema migrations and regression tests in `packages/techstack`

- Treat a `SCHEMA_VERSION` bump as incomplete until `applySchema` (`packages/techstack/src/store/schema.ts`) contains a guarded migration; `CREATE TABLE IF NOT EXISTS` is a no-op on existing tables.
- Guard column additions with the `ensureCatalogStorageColumns` pattern (`packages/core/src/session-catalog/store-schema.ts`): read `PRAGMA table_info(<table>)` into a set, then `ALTER TABLE ... ADD COLUMN` only for absent columns. Never issue an unconditional `ALTER TABLE`.
- Put legacy-version regression tests in `packages/techstack/tests/store/store-roundtrip.test.ts`, not `sqlite.test.ts` — the latter mocks `node:sqlite`, making migrations invisible. Reproduce by opening a store written at the previous `SCHEMA_VERSION`; a fresh `:memory:` database only exercises the new schema.
- When a passing suite hid a migration bug, report both defects: the missing migration and the missing regression test.
