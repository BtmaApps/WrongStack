## TS config blast radius

- For `tsconfig.base.json` edits, enumerate `extends` with repo-wide `rg 'tsconfig\.base\.json'`; call graphs cannot trace JSON config references.
- Always flag `packages/webui/tsconfig.json`, `packages/simpleui/tsconfig.json`, and `packages/webui-hq/tsconfig.json`; they inline base safety flags because bundler/JSX resolution blocks `extends`, so strictness changes can silently skip them.
- Treat `packages/tools/src/typecheck.ts` hits as filename-discovery candidates, not option consumers.

## Run evidence

- Empty `rg`/glob results under `.wrongstack/` (including `project-kit-runs`) are non-evidence because `rg` honors `.gitignore`; read `.wrongstack/AGENTS.md` before concluding absence.
- For `project_kit_run`, get error text from `project-kit.ts` `execute` via `JSON.stringify(result)`, not `record.json`; use `record.json` only for `status`, `durationMs`, and `runId`.

## TS traps

- Keep `packages/tui/tests/key-handler-replay-corpus.test.ts` with `tests/__snapshots__/key-handler-replay-corpus.test.ts.snap`; `makeHandler` uses `as never as Parameters<typeof createAppKeyHandler>[0]`, so compare snapshots/runtime failures and call order with `packages/tui/src/key-routes/key-route-composer.ts` and `key-route-pointer.ts`.
- For common names like `create`, use receiver-scoped `(sessionStore|store)\.create\(` grep over `packages/**/src`, excluding tests; reserve `codebase-incoming-calls` for distinctive names because its `file` filter cannot separate one class's methods.
