## Commands
- Typecheck per package: `node node_modules/typescript/bin/tsc --noEmit --pretty false -p packages/core/tsconfig.json` (likewise `packages/cli`, `packages/plugins`, `packages/tui`).
- Lint only touched files: `pnpm exec biome check <files>`. Tests: `pnpm exec vitest run <test files>`.

## Verify before believing a failure or finding
- Re-run a red typecheck/test cascade once before calling it a defect: parallel workers' in-flight edits cause phantom failures (a transient missing `failUndeliveredCommands` export at `packages/cli/src/hq-server/ws.ts`) that pass once the tree settles. [applied 4×, 4 ok]
- On `TS2305` for a cross-package import, rebuild the exporter first: `pnpm --filter @wrongstack/<pkg> build`. `@wrongstack/*` resolves subpaths via `package.json` `exports` to git-ignored `dist/*.d.ts`, so stale dist fabricates missing exports (root script: `pnpm build && pnpm -r typecheck`).
- When a finding names a missing export, re-grep the exact symbol in the target file immediately before editing — the remediation race can fall inside one turn (`THEME_RANDOM_ID`: absent on `read`, present seconds later in `packages/core/src/types/index.ts`).
- Cross-check Chimera ordering/semantics claims against the repo's pinned tests before accepting them: `expect(log.recent().map(...)).toEqual(['old','live'])` in `packages/cli/tests/hq-command-credential-lifecycle.test.ts` disproved a "newest-first" claim.

## Flipping a config default
- Grep the whole package's tests for the old literal first (`cascadeOn: 'off'` in `packages/core/tests/plugins/`): full-object `toEqual` default assertions pin the old value in more cases than any reviewer cites. Confirm no hits are explicit override inputs before `replace_all`.
- Update every operator-facing restatement: help strings and JSDoc in both `packages/core/src/plugins/chimera-plugin.ts` and `packages/core/src/plugins/auto-review-plugin.ts`.
- Verify: `pnpm exec vitest run packages/core/tests/plugins/auto-review-plugin.test.ts packages/core/tests/plugins/chimera-plugin.test.ts`.

## Lint handling of peer edits
- Fix `assist/source/organizeImports` noise from a peer's change with `pnpm exec biome check --write <file>` scoped to that file — never hand-reorder.
- Classify other assists as pre-existing only after `git diff -- <file>` shows your working-tree delta does not touch those lines.

## Security invariant
- Destructure and honor the `truncated` flag from `shellCommandLinesFromInput` (`packages/core/src/security/permission-helpers.ts`): fail closed — block/warn on truncated walks, mirroring `classifyShellSurfaceInput`. Silent `.lines` access (as in `packages/plugins/src/dep-guard/index.ts`) is a confirmed fail-open smuggling vector.
