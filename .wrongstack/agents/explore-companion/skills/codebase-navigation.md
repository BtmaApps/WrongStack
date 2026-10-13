## Gitignored proof rounds

- Bypass index tools for `.temp_files/proof-driven-bug-hunter/<round>/`: use direct `read`, `tree`, and explicitly path-scoped `grep`. Default repo-wide rg skips `.temp_files`; explicit paths work. Search the config filename in-round; zero matches support external invocation such as `vitest run -c`, not absence of callers.
- Close artifact consumers with a round-id grep of the **parent hunt directory**, plus repo-wide searches for distinctive harness needles. Classify `verify-full.ps1` and `full-verification/runtime-temp/` self-matches as harness residue, not consumers.
- Classify runner shape before describing execution: only `proof.ts`, without `run.mjs`, `vitest.proof.config.mjs`, or `REPORT.md`, indicates a Phase 2 direct-path script with exit codes 0/1/2. Treat a directory containing only `RECOVERY-NOTE.md` as terminal; read and verify its claims.

## Tests and ambiguous symbols

- Check `architecture/test-skip-budget.json` and `docs/reports/architecture-health-current.json` when mapping dependents of `packages/*/tests/`. Re-sync skip/content ratchets via root `check:architecture`.
- Grep `formatOutput` repo-wide before attributing callers: distinguish the helper in `packages/cli/src/slash-commands/dev.ts` from `formatOutputBytes` in `packages/webui`; `codebase-incoming-calls` reports ambiguous symbols.
- In `packages/sage`, search both `shared/pagination` and `sqlite-store-pagination`. Disambiguate duplicate `decodePageCursor` and `PageCursor` exports by import source; SQLite consumers use the sibling module.

## Module and public-surface closure

- For `packages/mcp/src/client-stdio-protocol.ts` in `@wrongstack/mcp`, combine module-path and per-exported-symbol greps over `packages/`. Check `packages/mcp/src/client.ts` (`onData`/`onLine`) and the adapter factory in `packages/mcp/src/client-hosts.ts`; incoming calls miss type-only edges.
- Never pass `tool-call-memory-triggers` as a symbol to `codebase-impact-analysis`: `symbolFound=false` is misleading. Search module paths and `ExtractedTriggerContext`/`MemoryToolTrigger`, then follow `tool-call-memory.ts:66-69` to `packages/sage/src/index.ts`.
- Verify `packages/mcp` exports against `packages/mcp/src/index.ts`, not `packages/mcp/src/transport.ts`: `index.ts:173-178` exposes only `HttpTransportOptions`, `SSEReader`, `SSETransport`, and `StreamableHTTPTransport` from `./transport.js`; `JsonRpcResult` and `extractJsonRpcResults` from `transport-jsonrpc.ts` remain internal.
- Classify `packages/governance` hits by full specifier: `verification-ledger-preconditions-contracts.js` is not `verification-ledger-preconditions`; verify the latter’s sole importer, `verification-ledger-store.ts`, and absence of barrel exports.
