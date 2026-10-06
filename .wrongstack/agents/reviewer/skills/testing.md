## Dead-code fix tests

- Before crediting a `packages/tools/tests/dead-code-engine.test.ts` case that passes both `verify: 'none'` and `verifyCommand` to `applyDeadCodeFixes`, confirm the apply-time gate in `packages/tools/src/dead-code/fix.ts` actually runs the extra command when the typecheck mode is `'none'` (the `verifyCommand` doc says "after the typecheck"); a mode-gated skip would make `rolledBack` untestable. `[applied 5×, 5 ok]`

## Vitest builtin mocks

- For a new vitest file mocking a Node builtin, match the factory's export surface to the production module's exact import style (named vs namespace, e.g. `import { spawn } from 'node:child_process'` in `packages/cli/src/boot/tui-project-spawn.ts`), and stub every member production code touches on the mocked return value (`child.on`, `child.unref`); an unstubbed member throws, and an awaited event the mock never emits hangs the suite.
- Confirm unmocked real code between the guard and the mock (resolution/fallback branches) cannot throw or return early under the test runner.

## MCP server tests

- Pin every fixture answering `initialize` to a revision in `SUPPORTED_PROTOCOL_VERSIONS` (`packages/mcp/src/constants.ts`) or `assertSupportedServerProtocolVersion` fails before the connect behavior under test; keep `'2025-11-25'` isolated in a deliberate protocol-mismatch test.
- When replacing JSON-RPC error-code assertions with tool-result refusals, verify `packages/mcp/src/server-dispatch.ts` converts `InvalidToolArgumentsError` to `{ content: [{ type: 'text', text: err.message }], isError: true }`, and assert only substrings of that same `err.message` (`${error.path}: ${error.message}`, `(+N more)` capping from `MAX_REPORTED_SCHEMA_ERRORS`).

## Live assertions

- Judge a changed assertion against the live test and fixture, not review-bundle text; in `packages/mcp/tests/server.test.ts`, reconcile `toContain('target')` with `arguments: [{ name: 'target', required: true }]`, and never report the stale `toContain('path')` as an inconsistency.

## In-project exports

- Before approving an export used by a literal dotted-path walker, read the full `IN_PROJECT_DENIED_PATHS` table in `packages/core/src/storage/config-loader/in-project-policy.ts` (a truncated `path:` grep misses entries), then keep the `listInProjectDeniedPaths()` consumer and the hand-maintained `filterSafeForProject` mirror in `packages/cli/src/settings-menu.ts` synchronized — wildcard-shaped entries otherwise go silently inert.
- For allow-list-driven absence tests, verify the stripped field's top-level parent exists in `PROJECT_SAFE_FIELDS` (`packages/cli/src/settings-menu.ts`); otherwise the assertion proves only that the field was never copied.

## Browser audits

- Detect Tab-sweep wrap by identity or a unique selector path matching the FIRST sampled element and enforce a meaningful minimum-`stops` threshold; never `break` on a repeated `tag:name`, which can stop the sweep before wrap.
- Never test outline color with `/transparent/.test(getComputedStyle(el).outlineColor)` — Chromium serializes `transparent` as `rgba(0, 0, 0, 0)`; parse alpha, assert visible opacity, and use hue alone to accept fully transparent focus rings.
