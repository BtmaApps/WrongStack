## TUI animation (`packages/tui/tests/`)
- Treat `vi.waitFor(..., { timeout, interval })` with a `vi.spyOn(Date, 'now')` frozen clock as the established anti-flake pattern (`banner-formation.test.tsx`): the spy leaves real timers free to drive Ink repaints and polling, making fixed-ms `settle()` waits the flaky construct. Judge frame determinism from the mocked clock value, not wall time; don't flag the waitFor form as a hang risk. [applied 2×, 2 ok]

## Browser smoke (`packages/vibeui/tests/browser-smoke.mjs`)
- Check strict counts (`.workspace-notes article`, skills listbox options) only for a single socket — the `for (const client of clients)` broadcast loop (`connections++`/`clients.add` in `wss.on('connection')`) breaks them.
- Accept `page.clock.install()` only when every later step is server-push-driven or synchronous; flag steps relying on app-side real timers.
- Verify canvas theme-contrast tokens exist in `packages/vibeui/src/app/globals.css`: a missing token makes `ctx.fillStyle` fail silently, reusing the previous color.
- Never assert `/transparent/` on `getComputedStyle(el).outlineColor` — Chromium serializes it as `rgba(0, 0, 0, 0)`; parse the alpha.

## Dead-code tests
- Before crediting `packages/tools/tests/dead-code-engine.test.ts` cases passing `verify: 'none'` + `verifyCommand` to `applyDeadCodeFixes`, read the apply-time gate in `packages/tools/src/dead-code/fix.ts`; if `'none'` skips extra commands, `rolledBack` is untested regardless of docs.

## Exec args (Windows, `bun --bun vitest`)
- Reject `node -e "<code>" -- <args>` (or `-p`) observation via `execTool`/`spawn` — Bun's `node.exe` shim drops the first positional. Require a `.cjs` sandbox at `argv[1]` asserting on `process.argv.slice(2)` (`packages/tools/tests/exec-autonomy.test.ts`).

## Vitest builtin mocks
- Match factories to production imports: `import { spawn } from 'node:child_process'` in `packages/cli/src/boot/tui-project-spawn.ts` needs a named export. Stub touched members (`child.on`, `child.unref`), emit awaited events, and confirm no unmocked branch between guard and mock can throw or return early.

## MCP server tests
- Build `initialize` fixtures from `SUPPORTED_PROTOCOL_VERSIONS` (`packages/mcp/src/constants.ts`); reserve `'2025-11-25'` for deliberate mismatch tests.
- Assert from source and live fixtures, not review-bundle text: confirm `packages/mcp/src/server-dispatch.ts` maps `InvalidToolArgumentsError` to `{ content: [{ type: 'text', text: err.message }], isError: true }` honoring `${error.path}: ${error.message}` and the `(+N more)` cap from `MAX_REPORTED_SCHEMA_ERRORS`; back `toContain('target')` in `packages/mcp/tests/server.test.ts` with the fixture's `arguments: [{ name: 'target', required: true }]`.

## In-project exports
- Read the full `IN_PROJECT_DENIED_PATHS` table (`packages/core/src/storage/config-loader/in-project-policy.ts`), not a `path:` grep, checking wildcards against literal dotted paths; keep `listInProjectDeniedPaths()` in sync with `filterSafeForProject` (`packages/cli/src/settings-menu.ts`).
- Count absence tests as proving stripping only when the field's parent is in `PROJECT_SAFE_FIELDS`; otherwise the field was never copied.
