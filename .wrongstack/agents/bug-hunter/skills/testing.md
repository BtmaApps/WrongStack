## Proven failure modes

- Never pass an arbitrary arrow-function predicate to Vitest 5 `toThrow`/`toThrowError`; it is treated as an error class, and the missing `prototype` causes `TypeError: Cannot read properties of undefined (reading 'constructor')`. Use `toThrow(/pattern/)`, as in `packages/mcp/tests/protocol-version-negotiation.test.ts`, or `try/catch` with explicit `toContain` assertions.
- Before accepting “module does not exist,” run `git status --short`, not only grep/diff: the definition may be untracked while the paired `exports` edit in `packages/core/package.json` is unstaged.

## Contract baselines and external edits

- For intentional behavior flips, derive the complete failing set with `pnpm exec vitest run <flagged files>` from the repo root rather than trusting cited assertions. For `packages/cli/src/wiring/dep-watcher-bridge.ts`, establish the red baseline with `pnpm exec vitest run packages/cli/tests/wiring-dep-watcher-bridge.test.ts`, then update stale tests to absent → enabled and `enabled: false` → skipped; do not revert the gate.
- For `tools/call` refusal changes in `packages/mcp/src/server-dispatch.ts`, include every WS-026 pin in `packages/mcp/tests/server-transport-guards.test.ts` plus `packages/mcp/tests/server-defensive-branches.test.ts`. Reuse `expectToolRefusal`/`toolRefusalText` for SEP-1303 in-band `isError` results.
- If `edit` reports external modification, re-read the file, preserve peer-settled bodies verbatim, and format only residual changes with `pnpm exec biome check --write <file>`.

## Verification

- Verify the CLI wiring change with `pnpm exec biome check packages/cli/tests/wiring-dep-watcher-bridge.test.ts`, `node node_modules/typescript/bin/tsc --noEmit --pretty false -p packages/cli/tsconfig.json`, and `node node_modules/typescript/bin/tsc --noEmit --pretty false -p packages/webui/tsconfig.json`.
- Verify MCP dispatch changes with `pnpm exec vitest run packages/mcp/tests/server-defensive-branches.test.ts packages/mcp/tests/server-transport-guards.test.ts`, `pnpm exec vitest run packages/mcp/tests/server.test.ts`, the MCP typecheck via `node node_modules/typescript/bin/tsc --noEmit --pretty false -p packages/mcp/tsconfig.json`, and scoped Biome checks.
- Record exact command strings and numeric `exitCode` values under `verification_evidence`.
- For `packages/webui/**`, do not use root Vitest; run `pnpm --filter @wrongstack/webui exec vitest run tests/components/<file>`.

## Reentrant registry sweeps

- For `packages/plugin-sdk/src/runtime/h1-state.ts`, add tests under `packages/plugin-sdk/tests/` that assert the rearming callback count with `toBe(1)` for both self-rearm termination and distinct-child sweep completeness.
