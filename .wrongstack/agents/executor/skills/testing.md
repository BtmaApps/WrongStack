## Commands

- Run `vitest` and `biome` only as `pnpm exec <tool>`, with `cwd` set to the package directory; avoid `test`, `lint`, and `format`, which fail with `Executable not found in $PATH`.
- Before a mechanical, source-driven fixture migration, save `pnpm exec vitest run <pkg> --no-color > .temp_files\baseline.log`, then edit only failures proven by that run. Keep direct state-injection fixtures unchanged.
- Run the MCP after-suite with `pnpm exec vitest run packages/mcp --no-color` from the repo root on Windows cmd. Compare like-for-like totals and require failed→passed, the same 4 skips, and no deleted or weakened tests; the proven migration moved 830→854 passed and 24→0 failed.
- Review working-tree hunks with `git diff -- <files>` via `exec`; do not use the `diff` tool's files-only mode, which does not provide hunks.

## MCP fixtures

- Terminate the final SSE event in every fixture with a blank line: join `'data: …', '', ''` with `\n`. `SSEReader` and `completeEventsEnd` dispatch only after that blank line, so `data: x\n` plus `controller.close()` silently loses the final event.
- Add `"jsonrpc":"2.0"` to every streamable-transport envelope fixture, but omit it from SSE fixtures. `extractJsonRpcEnvelopes` in `packages/mcp/src/transport-jsonrpc.ts` rejects id-less envelopes missing `jsonrpc`; `SSEReader` does not validate it.
- In `packages/mcp/tests`, migrate initialize-*result* fixtures only when they feed a real transport `connect()` (for example, `INIT_RESULT` in `transport.test.ts`); `assertSupportedServerProtocolVersion` in `packages/mcp/src/constants.ts` affects these. Leave `internals._serverMetadata` helpers such as `connectedClient()` and mocked `getServerMetadata()` returns unchanged.
- In `packages/mcp/src/protocol.ts`, use separate constants for sanitization: a `/…/g` regex for `String.replace` and a non-global `/…/` for `RegExp.test`; sharing the `g` regex makes `.test` stateful through `lastIndex`.

## Coverage attribution

- Do not trust a red 100% gate on a shared dirty tree. Parse uncovered `s`/`b`/`fn` entries in `packages/mcp/coverage/coverage-final.json`, map them to source, and use `git diff -- <file>` to attribute only gaps introduced by your hunks.

## Web UI fixtures

- When changing a store default, search the whole relevant package test tree for consumers of the changed key. Treat switch assertions in `packages/webui/tests/components/chimera-settings-panel.test.tsx` as implicit default pins: `fireEvent.click(getAllByRole('switch')[n])` can break solely because a seeded default changed.
