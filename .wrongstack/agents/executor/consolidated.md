## Generated Plugin Data

- Do not hand-edit the `pluginCatalog` block in `website/src/data/runtime-catalog.ts`; regenerate it with `pnpm run plugins:manifest:generate` (`scripts/generate-plugin-projections.mjs`).
- Ensure `packages/plugins/dist` reflects current source before running the plugin generator.
- Run generators through `pnpm run <script-name>`, not `pnpm exec node <script>`, because scripts may depend on `npm_execpath`.
- Treat `website/src/data/plugin-details-part-*.ts` as hand-maintained; no generator writes them.

## Safe Generator Execution on Shared Dirty Trees

- Before any `--write` generator run, snapshot only the files it writes into `.temp_files/<task>-backup`, run the generator, then compare each written file with `fc /b` against the snapshot. This verifies zero collateral changes without touching git state.
- On Windows, verify `.temp_files` cleanup with `dir /b .temp_files`; do not rely on `glob` for the hidden `.temp_files` directory.
- Do not trust quoted multi-path `del /q` success on Windows without a follow-up directory listing.

## SimpleUI Diff Testing

- When driving SimpleUI in tests, open the diff panel through the UtilityDock `Changes` badge.
- Do not rely on per-`ToolCallEntry` diff buttons in the live leader timeline; they may not render because `onOpenDiff` is not passed through.

## Default and Configuration Changes

- When flipping a store or config default, grep the full test tree for every consumer of the changed key, not just files named in the task.
- Expect toggle/emission tests, such as `packages/webui/tests/components/chimera-settings-panel.test.tsx`, to pin defaults implicitly by asserting that the first interaction changes seeded state.

## SAGE Memory Fallback

- If no MCP `remember` tool is registered, record SAGE memories programmatically through `packages/sage/dist/index.js`.
- Use the chain: `createSqliteMemoryPort({ projectRoot })` → `getSageService(port)` → `service.rememberSage({ text, kind, scope, anchors, supersedes, tags, importance, confidence })`.

## Type Checking and Test Types

- For `packages/kanban/tests`, use `pnpm exec tsc --noEmit --pretty false -p packages/kanban/tsconfig.test.json` to catch strict test issues such as optional collection access and incomplete fixtures.
- To identify newly introduced test TypeScript diagnostics, use `node scripts/check-test-typecheck.mjs --json`; raw `tsc` output may be dominated by baseline noise and cross-package path leakage.
- When mocking Node `fs/promises`, derive callback path arguments from the real signature with `Parameters<typeof fs.readFile>[0]` or `Parameters<typeof fs.writeFile>[0]`, then narrow `typeof path === 'string'` before using string-only operations.