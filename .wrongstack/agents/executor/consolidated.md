## Execution Conventions

- Invoke repository-local tools through `pnpm exec <tool>`. For `vitest` and `biome`, set `cwd` to the target package; wrapper commands such as `test`, `lint`, and `format` may fail because binaries are not globally available.
- On Windows `cmd`, capture repo-wide checks with `pnpm exec <tool> ... > .temp_files\<name>.log 2>&1` and inspect them using `type` or `findstr`. Do not rely on `tail`, `grep` pipes, `/d/...` `cd` paths, or bare `tsc`.
- Use `exec` with `git diff -- <files>` for working-tree hunk review; the `diff` tool's files-only mode does not provide usable hunks.
- Write a new test and observe its expected failure before implementing the fix when working on shared, frequently modified files. Stash/revert red-green cycles can overwrite concurrent changes.

## Test and Migration Verification

- Before a mechanical fixture migration caused by changed source behavior, capture a baseline with `pnpm exec vitest run <pkg> --no-color > .temp_files\baseline.log`. Edit only fixtures proven broken; fixtures that bypass the changed code path must remain untouched.
- Prove fixture migrations with a baseline-versus-after Vitest pair: total tests and skips should remain stable while expected failures become passes, demonstrating that no test was weakened, skipped, or deleted.
- In a shared dirty tree, do not attribute a red coverage gate entirely to your change. Parse `packages/mcp/coverage/coverage-final.json` (`s`, `b`, and `fn` maps), map uncovered lines to source, and compare them with `git diff -- <file>`.
- When changing a store or configuration default, search the full test tree for every consumer. Toggle and emission tests can pin defaults implicitly, including `packages/webui/tests/components/chimera-settings-panel.test.tsx`.

## Generated Plugin Data

- Do not hand-edit the `pluginCatalog` block in `website/src/data/runtime-catalog.ts`; regenerate it with `pnpm run plugins:manifest:generate` using `scripts/generate-plugin-projections.mjs`.
- Ensure `packages/plugins/dist` reflects current source before running the plugin generator.
- Run generators through `pnpm run <script-name>`, not `pnpm exec node <script>`, because scripts may depend on `npm_execpath`.
- Treat `website/src/data/plugin-details-part-*.ts` as hand-maintained; no generator writes those files.

## Safe Generator Execution

- Before any `--write` generator run, snapshot only its output files under `.temp_files/<task>-backup`, run the generator, and compare each written file with `fc /b` against its snapshot.
- On Windows, verify `.temp_files` cleanup with `dir /b .temp_files`; do not trust quoted multi-path `del /q` without a follow-up listing or rely on `glob` for the hidden directory.

## Project-Specific Behavior

- For `/mcp` list output, edit `renderList` in `packages/cli/src/services/mcp-management.ts`. `packages/cli/src/slash-commands/mcp-utils.ts` is a deprecated pure re-export and does not own rendering for REPL, TUI-fallback, or WebUI hosts.
- When driving SimpleUI tests, open the diff panel through the UtilityDock `Changes` badge. Do not rely on per-`ToolCallEntry` diff buttons in the live leader timeline.
- If no MCP `remember` tool is registered, record SAGE memories through `packages/sage/dist/index.js`: `createSqliteMemoryPort({ projectRoot })` → `getSageService(port)` → `service.rememberSage({ text, kind, scope, anchors, supersedes, tags, importance, confidence })`.

## Test Type-Checking

- For `packages/kanban/tests`, run `pnpm exec tsc --noEmit --pretty false -p packages/kanban/tsconfig.test.json` to catch strict test issues such as incomplete fixtures and optional collection access.
- Use `node scripts/check-test-typecheck.mjs --json` to identify newly introduced test diagnostics; raw `tsc` output may be dominated by baseline noise and cross-package path leakage.
- When mocking Node `fs/promises`, derive path arguments from the real signature with `Parameters<typeof fs.readFile>[0]` or `Parameters<typeof fs.writeFile>[0]`, then narrow `typeof path === 'string'` before string-only operations.

## OSS Review Reports

- Verify project activity from both the GitHub API and the fetched README. Fetch `https://api.github.com/repos/<org>/<repo>` and `https://raw.githubusercontent.com/<org>/<repo>/HEAD/README.md`; `archived: false` and a recent `pushed_at` can coexist with an explicit “read-only” or “no longer maintained” notice.
- Let the README's explicit maintenance statement determine the verdict when it conflicts with API metadata.