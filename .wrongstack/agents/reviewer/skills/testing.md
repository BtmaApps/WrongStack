## MCP server tests

- Pin every fixture answering `initialize` to a revision listed in `SUPPORTED_PROTOCOL_VERSIONS` (`packages/mcp/src/constants.ts`); otherwise `assertSupportedServerProtocolVersion` fails before connect behavior under test. Keep `'2025-11-25'` isolated in a deliberate protocol-mismatch test.
- When replacing JSON-RPC error-code assertions with tool-result refusals, verify `packages/mcp/src/server-dispatch.ts` converts `InvalidToolArgumentsError` to `{ content: [{ type: 'text', text: err.message }], isError: true }`. Assert only substrings produced by that same `err.message`, including `${error.path}: ${error.message}` and `(+N more)` capping from `MAX_REPORTED_SCHEMA_ERRORS`.

## Live assertion checks

- Before judging a changed assertion’s expected value, read the live test and fixture rather than relying on possibly stale review-bundle text. In `packages/mcp/tests/server.test.ts`, reconcile disk assertions such as `toContain('target')` with `arguments: [{ name: 'target', required: true }]`; do not report stale `toContain('path')` as an inconsistency.

## In-project exports

- Before approving an export used by a literal dotted-path walker, read the full `IN_PROJECT_DENIED_PATHS` table in `packages/core/src/storage/config-loader/in-project-policy.ts`, not a truncated `path:` grep. Keep the `listInProjectDeniedPaths()` consumer and hand-maintained `filterSafeForProject` mirror in `packages/cli/src/settings-menu.ts` synchronized; wildcard-shaped entries otherwise become silently inert.
- For allow-list-driven absence tests, first verify the stripped field’s top-level parent exists in `PROJECT_SAFE_FIELDS` (`packages/cli/src/settings-menu.ts`); otherwise the assertion proves only that the field was never copied.

## Browser audits

- Detect Tab-sweep wrap by identity or a unique selector path matching the FIRST sampled element, and enforce a meaningful minimum-`stops` threshold. Never `break` on a repeated `tag:name`, because duplicate labels can stop the sweep before wrap.
- Never test outline color with `/transparent/.test(getComputedStyle(el).outlineColor)`; Chromium serializes `transparent` as `rgba(0, 0, 0, 0)`. Parse alpha and assert visible opacity, using hue alone to accept fully transparent focus rings.
