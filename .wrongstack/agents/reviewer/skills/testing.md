## TUI animation (`packages/tui/tests/`)
- Treat `vi.waitFor(..., { timeout, interval })` with a `vi.spyOn(Date, 'now')` frozen clock as the established anti-flake pattern (`banner-formation.test.tsx`): the spy leaves real timers free to drive Ink repaints and polling, so fixed-ms `settle()` waits are the flaky construct. Judge frame determinism from the mocked clock value, not wall time; don't flag waitFor as a hang risk. [applied 2×, 2 ok]

## Browser smoke (`packages/vibeui/tests/browser-smoke.mjs`)
- Check strict counts (`.workspace-notes article`, skills listbox options) against the `for (const client of clients)` broadcast loop; they hold only for a single socket, confirmed via `connections++`/`clients.add` in `wss.on('connection')`.
- Accept `page.clock.install()` only when every later step is server-push-driven or synchronous; flag steps relying on app-side real timers.
- Canvas theme-contrast audits: verify token names exist in `packages/vibeui/src/app/globals.css`; a missing token makes `ctx.fillStyle` fail silently and reuse the previous color.
- Never assert `/transparent/` on `getComputedStyle(el).outlineColor`: Chromium serializes it as `rgba(0, 0, 0, 0)`; parse the alpha.

## Dead-code tests
- Before crediting `packages/tools/tests/dead-code-engine.test.ts` cases passing `verify: 'none'` + `verifyCommand` to `applyDeadCodeFixes`, read the apply-time gate in `packages/tools/src/dead-code/fix.ts`; if `'none'` skips extra commands, `rolledBack` is untested regardless of docs.

## Exec args (Windows, `bun --bun vitest`)
- Reject `node -e "<code>" -- <args>` (or `-p`) argument observation via `execTool`/`spawn`: Bun's `node.exe` shim drops the first positional. Require a `.cjs` sandbox script as `argv[1]` asserting on `process.argv.slice(2)`, as in `packages/tools/tests/exec-autonomy.test.ts`.

## Vitest builtin mocks
- Match factories to production imports: `import { spawn } from 'node:child_process'` in `packages/cli/src/boot/tui-project-spawn.ts` needs a named export. Stub touched members (`child.on`, `child.unref`), emit awaited events, and confirm no unmocked branch between guard and mock can throw or return early.

## MCP server tests
- Build `initialize` fixtures from `SUPPORTED_PROTOCOL_VERSIONS` (`packages/mcp/src/constants.ts`); reserve `'2025-11-25'` for deliberate mismatch tests.
- Confirm `packages/mcp/src/server-dispatch.ts` maps `InvalidToolArgumentsError` to `{ content: [{ type: 'text', text: err.message }], isError: true }`; assert substrings honoring `${error.path}: ${error.message}` and the `(+N more)` cap from `MAX_REPORTED_SCHEMA_ERRORS`.
- Judge live fixtures, not review-bundle text: in `packages/mcp/tests/server.test.ts`, `arguments: [{ name: 'target', required: true }]` backs `toContain('target')`.

## In-project exports
- Read the full `IN_PROJECT_DENIED_PATHS` table (`packages/core/src/storage/config-loader/in-project-policy.ts`), not a `path:` grep; check wildcard entries against literal dotted paths.
- Keep `listInProjectDeniedPaths()` in sync with `filterSafeForProject` (`packages/cli/src/settings-menu.ts`).
- Absence tests prove stripping only when the field's parent is in `PROJECT_SAFE_FIELDS`; otherwise the field was never copied.
