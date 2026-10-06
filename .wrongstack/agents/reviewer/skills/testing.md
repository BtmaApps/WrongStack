## MCP server tests
- Pin fixtures answering `initialize` to revisions in `SUPPORTED_PROTOCOL_VERSIONS` (`packages/mcp/src/constants.ts`); `assertSupportedServerProtocolVersion` fails before connect behavior for other revisions. Reserve `'2025-11-25'` for a deliberate-mismatch test.
- When JSON-RPC error-code assertions become tool-result refusals, verify `packages/mcp/src/server-dispatch.ts` converts `InvalidToolArgumentsError` to `{ content: [{ type: 'text', text: err.message }], isError: true }`, and assert only substrings built from that `err.message`: `${error.path}: ${error.message}` and `(+N more)` from `MAX_REPORTED_SCHEMA_ERRORS`.

## Live assertion checks
- Before judging a changed expected value, read the live file/fixture. For `packages/mcp/tests/server.test.ts`, trust disk `toContain('target')` and `arguments: [{ name: 'target', required: true }]`; stale bundle `toContain('path')` is not self-inconsistency.

## In-project exports
- Read full `IN_PROJECT_DENIED_PATHS` (`packages/core/src/storage/config-loader/in-project-policy.ts`), not `path:` grep; dotted-path consumers make wildcard-shaped entries inert through `listInProjectDeniedPaths()`.
- Keep `filterSafeForProject` mirror in `packages/cli/src/settings-menu.ts` and require a stripped field's parent in `PROJECT_SAFE_FIELDS`; absent assertion only meaningful if copied.

## Browser audits
- Tab sweeps: break only when first sampled element/selector repeats; assert minimum `stops`. Do not break on repeated `tag:name` (duplicate labels skip real wrap).
- Focus rings: don't regex `/transparent/.test(getComputedStyle(el).outlineColor)`; Chromium gives `rgba(0, 0, 0, 0)`. Parse/compare alpha, not hue alone.
