## Dead-code tests [applied 5×, 5 ok]
- Before crediting tests in `packages/tools/tests/dead-code-engine.test.ts` passing `verify: 'none'` and `verifyCommand` to `applyDeadCodeFixes`, inspect the apply-time gate in `packages/tools/src/dead-code/fix.ts`. Confirm extra commands run in mode `'none'` despite the “after the typecheck” documentation; a mode-gated skip leaves `rolledBack` untested.

## Vitest builtin mocks
- Match mock-factory exports to production imports: `import { spawn } from 'node:child_process'` in `packages/cli/src/boot/tui-project-spawn.ts` requires a named export. Stub touched return-value members (`child.on`, `child.unref`) and emit awaited events to prevent throws or hangs. Check that unmocked resolution/fallback branches between the guard and mock cannot throw or return early under Vitest.

## MCP server tests
- Use `SUPPORTED_PROTOCOL_VERSIONS` from `packages/mcp/src/constants.ts` for `initialize` fixtures; reserve `'2025-11-25'` for deliberate mismatch tests. Otherwise `assertSupportedServerProtocolVersion` fails before the intended connect behavior.
- For tool-result refusals, verify `packages/mcp/src/server-dispatch.ts` maps `InvalidToolArgumentsError` to `{ content: [{ type: 'text', text: err.message }], isError: true }`. Assert substrings of `err.message`, respecting `${error.path}: ${error.message}` and the `(+N more)` cap from `MAX_REPORTED_SCHEMA_ERRORS`.
- Check live fixtures rather than review-bundle text: in `packages/mcp/tests/server.test.ts`, `arguments: [{ name: 'target', required: true }]` supports `toContain('target')`; do not report stale `toContain('path')` as a live inconsistency.

## In-project exports
- Read the full `IN_PROJECT_DENIED_PATHS` table in `packages/core/src/storage/config-loader/in-project-policy.ts`, not a truncated `path:` grep. Keep `listInProjectDeniedPaths()` synchronized with `filterSafeForProject` in `packages/cli/src/settings-menu.ts`; check wildcard-shaped entries against literal dotted-path traversal.
- In absence tests, confirm the stripped field’s parent belongs to `PROJECT_SAFE_FIELDS` in `packages/cli/src/settings-menu.ts`; otherwise absence only proves it was never copied.

## Browser audits
- Avoid `/transparent/.test(getComputedStyle(el).outlineColor)`: Chromium serializes transparency as `rgba(0, 0, 0, 0)`. Parse alpha when asserting outline visibility; hue alone cannot establish opacity.
