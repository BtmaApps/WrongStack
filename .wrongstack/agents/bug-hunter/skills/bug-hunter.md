## Parallel-worker reconciliation

- On an `edit` "file was modified externally" race, re-read and preserve the settled diff; fix only residual `TS6133`, stale-arity `TS2554`, or `assist/source/organizeImports` issues. Use scoped `pnpm exec biome check --write <file>`, then `pnpm exec biome check <file>` and the package typecheck; never duplicate a peer’s helper.
- Falsify Chimera extraction claims in `packages/webui` by grepping flagged identifiers and running `node node_modules/typescript/bin/tsc --noEmit --pretty false -p packages/webui/tsconfig.json`. Check newly created or untracked sibling modules. If diagnostics concern only unrelated peer-modified files, report their `file:line` separately; do not patch them or claim the package passed.

## Contract checks

- Before patching a `readGenerated` catch-block finding in `packages/plugins/src/semver-bump/index.ts`, enumerate its before×after matrix: absent-before+absent-after → skip; present-before+absent-after → throw; bytes-differ → stage. After changes, run `pnpm exec vitest run packages/plugins/tests/semver-bump-exec.test.ts`; distinguish unrelated package failures.
- Before reporting fixture-host drift, compare literal endpoints such as `auth.kimi.ai` with `KIMI_TOKEN_URL` / `deviceUrl` in `packages/providers/src/oauth/subscription-flows.ts`; run `pnpm exec vitest run packages/providers/tests/subscription-device-auth.test.ts`. Account for `vi.stubGlobal` / `vi.spyOn` overrides rather than treating source literals alone as the tested contract.
- For JSX-prop findings, grep exact prop names package-wide, including `useMemoryManagerState` in `packages/webui/src/components/MemoryManager/` and `sharedSearch?`. If wiring the consumer requires inventing UX, stop passing unsupported props and leave dormant scaffolding to the feature owner.
- For visibility-policy contradictions, compare comments, owner-pinned tests, and stated policy. Report fail-open versus fail-closed alternatives; do not unilaterally flip security-boundary behavior.

## Schema migrations

- Pair every `SCHEMA_VERSION` bump with a guarded migration in `applySchema` at `packages/techstack/src/store/schema.ts`; `CREATE TABLE IF NOT EXISTS` does not update existing tables.
- Follow `ensureCatalogStorageColumns` in `packages/core/src/session-catalog/store-schema.ts`: collect `PRAGMA table_info(<table>)`, then `ALTER TABLE ... ADD COLUMN` only for absent columns.
- Test previous-version stores in `packages/techstack/tests/store/store-roundtrip.test.ts`, not `sqlite.test.ts`, which mocks `node:sqlite`. Do not rely on `:memory:` creation to prove migration coverage.
