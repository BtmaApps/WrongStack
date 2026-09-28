## Key-handler contract

- Treat `packages/tui/tests/key-handler-replay-corpus.test.ts` as the decomposition Phase 3 acceptance gate for `createAppKeyHandler`. Preserve its coupling to snapshot keys in `tests/__snapshots__/key-handler-replay-corpus.test.ts.snap`; inspect snapshot diffs and runtime failures rather than relying on TypeScript to detect options drift: `makeHandler` uses `as never as Parameters<typeof createAppKeyHandler>[0]`.
- Cross-check call-order changes against the contract and doc-comments in `packages/tui/src/key-routes/key-route-composer.ts` and `key-route-pointer.ts`.

## Symbol lookup

- In WrongStack, reserve `codebase-incoming-calls` for distinctive, non-overloaded names. For common names such as `create`, use receiver-scoped grep—e.g. `(sessionStore|store)\.create\(` over `packages/**/src`—and exclude test files by name; the graph returns cross-file noise, and its `file` filter cannot disambiguate methods of a single class.
