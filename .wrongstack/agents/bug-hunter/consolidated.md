# Bug-Hunter Agent Instructions

## Adjudication Standard

- Treat review findings, suggested patches, and retractions as hypotheses. Validate them against the literal live source, complete producer-to-consumer flow, covering tests, explicit owner communications, and repository policy.
- Immediately before citing or editing a file, reread it and inspect both `git status --short -- <path>` and `git diff -- <path>`. Include unstaged and untracked files; HEAD-only inspection can miss an already-applied source or manifest fix.
- For test-based findings, first run `pnpm exec vitest run <flagged files>` from the repository root. If assertions just read as broken pass, reread the file and report the finding as already resolved with live citations; do not patch it.
- Falsify missing-module, missing-export, and undeclared-identifier claims before changing code: search package-wide for both imported and exported identifiers, read every relevant import and lexical declaration, inspect covering tests, and run the package typecheck. Include untracked sources and paired `package.json` `exports`.
- For an intentional, documented contract flip, derive the complete failing set from a baseline run rather than the reviewer’s cited assertions. Update stale tests and preserve migration helpers instead of restoring the old behavior. For `packages/cli/src/wiring/dep-watcher-bridge.ts`, absent configuration means enabled, while explicit `enabled: false` means skipped.
- Treat pinned repository assertions and explicit owner policy as stronger evidence than unsupported reviewer expectations.

## Concurrent Work and Ownership

- Preserve working-tree changes that already resolve a finding. If a refactor is partially applied, finish only the residual cleanup rather than duplicating a declaration or implementation.
- After an `edit` reports “file was modified externally,” reread and re-anchor to the current file. Preserve settled peer bodies verbatim; never retry a stale replacement.
- Changing diagnostic coordinates, test counts, or failures on a co-modified tree indicate an unstable verification snapshot. Check the exact production and test paths with `git status --short`, rerun after peers settle, and report peer failures separately rather than absorbing them.
- Respect explicit ownership instructions. If editing is prohibited, provide read-only evidence and stop. Before reapplying reverted code, check owner communications and pinning tests for intentional policy.
- After concurrent changes settle, check for residual stale imports, call arity, unused parameters, and formatting, then verify the final tree rather than relying on an earlier snapshot.

## Verification

- Run the flagged suite before accepting deterministic broken-test claims: `pnpm exec vitest run <file>`. Discover covering tests with both `.test.ts` and `.test.tsx` searches.
- Run package compilation checks with `node node_modules/typescript/bin/tsc --noEmit --pretty false -p <package>/tsconfig.json`. Use `packages/core/tsconfig.test.json` when checking core test typing.
- Treat a clean typecheck as evidence only for its checked scope, not as proof of runtime correctness. Keep unrelated or peer-owned diagnostics separate.
- For parse-error cascades ending in `Unterminated template literal`, investigate the earliest relevant diagnostic first; later locations may be parser fallout.
- Use `pnpm exec biome check <file>` for scoped lint verification and `pnpm exec biome check --write <file>` only for necessary formatting or import cleanup. Never widen formatter writes across a shared tree.
- Never pass an arbitrary arrow-function predicate to Vitest 5 `toThrow` or `toThrowError`; use `toThrow(/pattern/)` or `try`/`catch` with explicit `toContain` assertions.

## Cross-Cutting Checks

- Do not infer a race from `void someAsyncFn()` alone. An async function without an `await` runs synchronously; inspect dependencies and actual suspension points.
- Verify workflow findings against the live `.github/workflows/*.yml`, including unstaged paired changes.
- For allegedly nonexistent pnpm filter targets, search all `**/package.json` files and confirm the exact package `name` and invoked script before changing commands.

## Project-Specific Contracts

- Any `Tool` gate in `packages/core/src/sandbox/wrap.ts` must fail closed across both `execute` and `executeStream`; an execute-only path can bypass stream-only tools. Resolve policy per call with `resolveSandboxConfigForAgent(ctx?.agentId)` because process-global configuration alone ignores tightened per-agent overrides. Verify with the core typecheck and `pnpm exec vitest run packages/core/tests/sandbox packages/mcp/tests/wrap-tool-sandbox.test.ts`.
- Preserve mutate-then-`appendHistory` ordering and the fresh under-lock read around `generateSuggestions` in `packages/requirement-intake/src/service.ts`. Replacing them with an outside-callback pre-`await` read can reintroduce phantom-history TOCTOU.
- Before accepting a stale slot-attached diagnostic in the MCP registry lifecycle, verify that `attemptConnectSlot` clears `slot.protocolVersionRefusal` before suspension, the `!isCurrent() || state === 'disconnected'` guard blocks post-generation writes, and `stop()` bumps the generation before clearing `connecting`.
- Reentrant registry helpers such as `packages/plugin-sdk/src/runtime/h1-state.ts` should track released callback identities in a `Set`, not use an iteration cap. Remove stale slots on `break`, and test exact callback invocation counts for self-rearm termination and distinct-child sweep completeness.
- Proxy delegation in `packages/vector-memory/src/sage-port-wrapper.ts` must preserve fluent returns with `result === target ? delegated : result`; test with the `ClassInstancePort` prototype-method fixture in `packages/vector-memory/tests/sage-port-wrapper.test.ts`.
- Inspect `packages/core/src/kernel/events/*.ts` before claiming an event payload field is missing.
- Lease fencing in `packages/kanban/src/manager/lifecycle/definition-of-done.ts` must compare against live `task.assignment`; comparing against the report’s own lease can become tautological.
- Validate transformed fixtures against equally transformed expectations, not raw scrubbed artifacts.
- UTF-8 byte-bound truncation in `packages/core/src/chronicle/tool-adapter.ts` must remove dangling lead and continuation bytes; verify decoded validity and re-encoded length remain within budget.