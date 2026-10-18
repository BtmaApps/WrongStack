## Browser smoke (`packages/vibeui/tests/browser-smoke.mjs`)
- Check strict count assertions, such as the `.workspace-notes article` count or the skills listbox option count, against the `for (const client of clients)` broadcast loops. Broadcasts and strict counts only coexist when the page holds exactly one socket. Confirm this via `connections++` / `clients.add` in `wss.on('connection')`.
- Accept a `page.clock.install()` without a matching uninstall only if every later step is server-push-driven or synchronous. Flag it if later steps rely on app-side real timers.
- For theme-contrast audits that sample CSS custom properties through a 2D canvas, confirm the token names exist in `packages/vibeui/src/app/globals.css`. If `getPropertyValue` returns empty, the `ctx.fillStyle` assignment fails silently and reuses the previous color, so the assertion measures the wrong token.
- Never assert `/transparent/.test(getComputedStyle(el).outlineColor)`. Chromium serializes transparency as `rgba(0, 0, 0, 0)`, so parse the alpha instead.

## Dead-code tests
- Before crediting `packages/tools/tests/dead-code-engine.test.ts` cases that pass `verify: 'none'` plus `verifyCommand` to `applyDeadCodeFixes`, read the apply-time gate in `packages/tools/src/dead-code/fix.ts`. If mode `'none'` skips extra commands, `rolledBack` is untested, regardless of what the docs say.

## Exec argument passing (Windows, `bun --bun vitest`)
- Reject tests that use `node -e "<code>" -- <args>` (or `-p`) to observe arguments through `execTool`/`spawn`. Here `process.execPath` is Bun's `node.exe` shim, which drops the first positional argument. Require a `.cjs` script in the sandbox passed as `argv[1]`, asserting on `process.argv.slice(2)`, as in `packages/tools/tests/exec-autonomy.test.ts`.

## Vitest builtin mocks
- Mock factories must match production imports. For example, `import { spawn } from 'node:child_process'` in `packages/cli/src/boot/tui-project-spawn.ts` needs a named export.
- Stub the return-value members the code touches (`child.on`, `child.unref`) and emit any awaited events.
- Verify that unmocked branches between the guard and the mock cannot throw or return early.

## MCP server tests
- Build `initialize` fixtures from `SUPPORTED_PROTOCOL_VERSIONS` (`packages/mcp/src/constants.ts`). Reserve `'2025-11-25'` for deliberate mismatch tests.
- For refusals, confirm `packages/mcp/src/server-dispatch.ts` maps `InvalidToolArgumentsError` to `{ content: [{ type: 'text', text: err.message }], isError: true }`.
- Assert substrings that respect the `${error.path}: ${error.message}` format and the `(+N more)` cap from `MAX_REPORTED_SCHEMA_ERRORS`.
- Judge live fixtures, not review-bundle text. In `packages/mcp/tests/server.test.ts`, `arguments: [{ name: 'target', required: true }]` backs `toContain('target')`.

## In-project exports
- Read the full `IN_PROJECT_DENIED_PATHS` table in `packages/core/src/storage/config-loader/in-project-policy.ts` rather than a `path:` grep.
- Keep `listInProjectDeniedPaths()` in sync with `filterSafeForProject` in `packages/cli/src/settings-menu.ts`. Check wildcard entries against literal dotted paths.
- Absence tests only prove stripping if the field's parent is in `PROJECT_SAFE_FIELDS`. Otherwise the field was simply never copied.
