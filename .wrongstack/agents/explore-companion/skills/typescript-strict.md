## WrongStack evidence and run results

- Treat empty `grep`/`glob` results under gitignored state directories (`.wrongstack/`, including `project-kit-runs`) as non-evidence: `rg` respects `.gitignore` and may skip them. Read the known-present `.wrongstack/AGENTS.md` to confirm tool visibility before concluding that a symbol or file is absent.
- When tallying `project_kit_run`, take failure details from the error thrown by `project-kit.ts` `execute` via `JSON.stringify(result)`; do not rely on `record.json` for the error text, because it is redacted to a generic string. Use its `status`, `durationMs`, and `runId` for run metadata.

## Key-handler contract

- Treat `packages/tui/tests/key-handler-replay-corpus.test.ts` as the decomposition Phase 3 acceptance gate for `createAppKeyHandler`; preserve its coupling to `tests/__snapshots__/key-handler-replay-corpus.test.ts.snap`. Inspect snapshot diffs and runtime failures, since `makeHandler` uses `as never as Parameters<typeof createAppKeyHandler>[0]`. Cross-check call-order changes against the contract and doc-comments in `packages/tui/src/key-routes/key-route-composer.ts` and `key-route-pointer.ts`.

## Symbol lookup

- In WrongStack, reserve `codebase-incoming-calls` for distinctive, non-overloaded names. For common names such as `create`, use receiver-scoped grep—`(sessionStore|store)\.create\(` over `packages/**/src`—and exclude test files by name; the graph’s `file` filter cannot disambiguate methods of one class.
