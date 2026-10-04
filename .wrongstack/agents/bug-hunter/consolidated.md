# Bug-Hunter Agent Instructions

## Adjudicate Against the Live Tree

- Treat review findings and suggested fixes as hypotheses. Verify them against literal source, covering tests, and explicit owner policy; do not change behavior merely to satisfy a reviewer’s preference.
- Re-read affected files immediately before citing or editing them. Use `git status --short -- <path>` to identify unstaged or untracked changes; HEAD-based diffs and truncated file lists can miss paired fixes.
- Inspect modules listed as unverified and trace the full producer-to-consumer flow before accepting missing-symbol, ordering, or contract claims.
- When review prose, JSON findings, or retractions contradict each other, verify both the original premise and the replacement claim against source; a retraction can introduce another factual error.
- Re-grep allegedly missing identifiers and inspect their actual lexical scope. Occurrence counts alone do not establish that a declaration is available at a reference.
- Cross-check claimed contracts against deliberate repository assertions. Pinned behavior is stronger evidence than unsupported reviewer expectations.

## Parallel Work and Ownership

- Preserve working-tree changes that already resolve a finding. If a move is partially applied, finish only the residual, such as removing a dead original declaration, rather than duplicating the new declaration.
- On an `edit` “file was modified externally” error, re-read and re-anchor to current text; do not retry a stale replacement or overwrite a peer’s settled fix.
- Re-run failing checks before attributing defects when affected files are changing concurrently. Test-count or diagnostic-coordinate changes indicate an unstable verification snapshot, not proof that a failure is harmless.
- Check `git status --short` on failing tests and production files. Report suspected peer TDD separately, with concrete evidence, rather than silently dismissing failures or expanding your patch.
- Respect explicit ownership instructions. If told not to edit, stop and report read-only findings. Before reapplying a reverted fix, check owner communications and pinning tests for intentional policy.
- After peer changes settle, check for residual unused parameters, stale call arity, imports, and formatting; verify the final tree rather than reporting evidence from an earlier snapshot.

## Verification

- Run the flagged suite before accepting deterministic “broken test” claims: `pnpm exec vitest run <file>` from the repository root. Use this directly if the `test` wrapper cannot resolve `vitest`.
- Run the package typecheck before patching compilation claims: `node node_modules/typescript/bin/tsc --noEmit --pretty false -p <package>/tsconfig.json`. For core test typing, use `packages/core/tsconfig.test.json`.
- A clean typecheck contradicts compiler-error claims in its checked scope, but does not establish runtime correctness. Keep unrelated diagnostics separate.
- For a parse-error cascade ending in `Unterminated template literal`, investigate the earliest relevant diagnostic first; later locations may be parser fallout. Fix and rerun before changing them individually.
- Discover covering tests with both `.test.ts` and `.test.tsx` globs. For web UI tests, use `pnpm --filter @wrongstack/webui exec vitest run <test-path>`.
- Use `pnpm exec biome check <file>` for scoped lint verification and `pnpm exec biome check --write <file>` for necessary formatting or import cleanup. Never widen formatter writes across a shared tree.
- After editing, rerun scoped lint, package typecheck, and covering tests; distinguish successful checks from remaining failures.

## Workflow and Package Findings

- Verify workflow findings against live `.github/workflows/*.yml`, including unstaged paired changes, before patching.
- For allegedly nonexistent pnpm `--filter` targets, search `**/package.json`, including top-level directories such as `website/`, not only `apps/**`; confirm the exact `name` and invoked script.

## Language and Data-Flow Checks

- TypeScript function parameters are assignable; object spread preserves unspecified fields. In `packages/core/src/sandbox/wrap.ts`, trace `input = applyRoute(...)` through `rawExecute.call(tool, input, ...)` rather than accepting strict-mode or lost-`args` claims.
- Do not infer races from `void someAsyncFn()` alone. An async function without `await` executes its body synchronously; inspect dependencies and actual suspension points.
- Before claiming hashing or deduplication is bypassed, inspect the callee’s signature and internal key derivation.
- Preserve nullish semantics: `0 ?? fallback` is `0`; replacing `??` with an undefined-only check changes behavior for `null`.
- For numeric inputs, `n > 0 ? n : 0` and `n >= 0 ? n : 0` are behaviorally equivalent; do not inflate a naming concern into a correctness defect.
- Before removing or adding a JSX prop, inspect package-wide consumers, hooks, and adapters. Do not invent missing product UX to repair incomplete scaffolding.

## Concrete Regression Contracts

- Proxy delegation in `packages/vector-memory/src/sage-port-wrapper.ts` must map fluent returns with `result === target ? delegated : result`; verify using the `ClassInstancePort` prototype-method fixture in `packages/vector-memory/tests/sage-port-wrapper.test.ts`, not object literals.
- Event payload types reside in `packages/core/src/kernel/events/*.ts`; inspect that directory before claiming a field is missing.
- Lease fencing in `packages/kanban/src/manager/lifecycle/definition-of-done.ts` compares against live `task.assignment`; replacing it with a report’s own persisted lease comparison can create a tautology and defeat fencing.
- For catch-block “silent swallow” claims, enumerate before/after states and resulting skip, throw, or stage behavior before patching; cover `packages/plugins/src/semver-bump/index.ts` with `packages/plugins/tests/semver-bump-exec.test.ts`.
- Validate fixture transformations before trusting assertions: scrubbed artifacts must be compared with scrubbed expectations, not raw secrets.
- Byte-bound UTF-8 truncation must remove dangling lead bytes as well as continuation bytes. In `packages/core/src/chronicle/tool-adapter.ts`, verify decoded validity and re-encoded byte length against the budget; replacement characters can increase size.