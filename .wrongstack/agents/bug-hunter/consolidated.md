# Bug-Hunter Agent Instructions

## Adjudication and Concurrent Work

- Treat findings, proposed patches, and retractions as hypotheses. Validate literal live source, producer-to-consumer flow, covering tests, and explicit owner policy before editing.
- Before citing or changing a file, reread it and inspect `git status --short -- <path>` and `git diff -U0 -- <path>`. On co-modified trees, compare `git diff --stat` and the exact-path diff again before applying a cascading fix.
- Reviewer snapshots can lag active work. Falsify “no producer,” missing guard, self-recursion, and stale-dependency claims against live code; report already-fixed findings as resolved rather than duplicating logic.
- For missing props, search the actual call site case-sensitively, including `packages/tui/src/app-view.tsx`. For `useCallback`/`useMemo` findings, inspect the actual dependency array, including `publishBand` in `packages/tui/src/components/history/use-history-controller.ts`.
- After external modification or a guarded-edit no-match, reread and re-anchor to current text; never retry an unchanged replacement. Preserve peer changes and obey read-only ownership boundaries.
- Falsify missing-module, missing-export, duplicate-identifier, and undeclared-identifier claims with package-wide symbol searches and a package typecheck. Clean compilation resolves the compile claim only within the checked scope, not runtime correctness.
- Separate unrelated peer diagnostics from the reviewed change. Changing failures or test counts indicate an unstable snapshot: inspect affected paths, let concurrent edits settle, and rerun verification.

## Verification

- Use Bun-native tooling: `bunx vitest run <covering files>` and `bunx biome check <files>`. Use `bunx biome check --write <files>` only for necessary formatting. The repository pins Bun; stale `pnpm exec` commands can fail.
- Run `node node_modules/typescript/bin/tsc --noEmit --pretty false -p <package>/tsconfig.json`; use `packages/core/tsconfig.test.json` for core test typing.
- Run covering tests before accepting deterministic failure claims and after fixes. Search both `.test.ts` and `.test.tsx`. Investigate the earliest parse diagnostic before treating cascaded errors independently.
- Establish disputed test provenance with `git status --short` and `git log --oneline -5 -- <test file>`; untracked status alone does not establish authority. Preserve unaffected assertions and add focused regressions for restored contracts.
- For suspicious trailing delimiters, inspect exact characters and run the typecheck rather than trusting rendered output. Prefer guarded edits over PowerShell double-quoted `String.Replace`, where backticks are escapes.
- In Vitest 5, use `toThrow(/pattern/)` or explicit `try`/`catch`; do not pass arbitrary arrow predicates to `toThrow`.
- For mocking claims, inspect consumer access style and whether the assertion would fail if the patch missed; require an executed counterexample before rejecting builtin ESM synchronization via `syncBuiltinESMExports()`.

## Race and State-Transition Analysis

- Construct counterexamples using actual suspension points, guard subsumption, and write ordering. A promise-returning function without `await` executes its body synchronously.
- Check React dependency-change semantics before alleging optimistic-state flicker: an effect keyed on a persisted value does not rerun merely because an unrelated local override changes.
- Validate existence before acquiring run leases so invalid input cannot hold a lease or mask not-found as `GoalRunLeaseBusyError`.
- Acquire leases locally, recheck `!host.stopping` after the last await immediately before assigning `host.releaseRunLease`, then clear local ownership and release leftovers in `finally`.
- In `handleStop`, capture `startInFlight` at entry to gate terminal persistence; do not substitute lease-field state or leave parallel ungated `graph.runState` mutations.
- Teardown-membership-gated synchronous listeners need synchronous registration. In `packages/cli/src/wiring/dep-watcher.ts`, register a deferred placeholder before awaiting `multiAgentHost.spawn()`, then adopt completion; account for a director appearing after spawn.
- In `packages/cli/src/goal-host.ts`, inspect the synchronous prefix of `onGoalStop`: setting stopped state and unsubscribing before the first await can already exclude later completion events.

## Project Contracts

- In `packages/webui/src/hooks/ws-handlers/goal-handlers.ts`, accept keyless broadcasts before goal-id filtering, including `goal.error` and `goal.stopped` when `host.graph` is null.
- Sandbox `Tool` gates in `packages/core/src/sandbox/wrap.ts` must fail closed for both `execute` and `executeStream`, resolving per-agent policy on each call.
- Preserve mutate-then-`appendHistory` ordering and fresh under-lock reads around `generateSuggestions` in `packages/requirement-intake/src/service.ts`.
- For MCP connection races, verify refusal state clears before suspension, stale-generation writes are blocked, and `stop()` advances generation before clearing `connecting`.
- MCP transport values are `stdio | sse | streamable-http`. Align TUI validation and error messages with `packages/cli/src/boot/mcp-config-flag.ts`; `packages/cli/src/acp-mcp-servers.ts` canonicalizes `http` to `streamable-http`.
- Evaluate rotation arithmetic over reachable counts and branches, not expression appearance; confirm parser modifier flags before alleging reverse-navigation bugs.
- In `packages/plugin-sdk/src/runtime/h1-state.ts`, track released callback identities and test exact cleanup counts. In `packages/vector-memory/src/sage-port-wrapper.ts`, preserve fluent returns with `result === target ? delegated : result`.
- Inspect `packages/core/src/kernel/events/*.ts` before declaring event fields missing. Lease fencing in `packages/kanban/src/manager/lifecycle/definition-of-done.ts` must compare against live `task.assignment`.