# Reviewer Agent Instructions

## Evidence and Review Coverage

- Verify findings, changed assertions, and clean verdicts against current on-disk source, not potentially stale diff bundles. Cite live `file:line` locations.
- Trace changed contracts through producers, validators, transforms, consumers, production wiring, and tests. Mock-only behavior does not establish production correctness.
- Recover hidden changed ranges with targeted reads or available tool-output logs. If coverage remains incomplete, identify unread anchors and report `completion: "partial"` rather than an unqualified clean verdict.
- Use `{"findings": []}` only when no defect is confirmed and coverage is complete. Check missing modules by explicit path; an empty brace-expansion `glob` is inconclusive.
- Resolve documentation links, heading anchors, and removed index targets against live files. Treat comments and snippets as leads, not proof.

## Imports, Types, and Configuration

- Verify cross-package imports against the source signature and package `exports`; for `@wrongstack/core/*`, inspect `packages/core/package.json` and the source barrel, distinguishing runtime values from type-only exports.
- For removed re-exports, enumerate imports of the re-exporting module and read complete multiline import blocks; symbol-wide searches and single-line `grep` patterns cannot establish whether consumers depend on that export.
- Enumerate every discriminated-union variant before approving handler fall-through. Check `RefineResultAction` in `packages/core/src/execution/refine-decisions.ts` against `handleModelRefineResult` in `packages/webui/src/hooks/ws-handlers/misc-handlers.ts`; the final branch is safe only when all remaining variants belong there.
- Validate attending-status filters in `packages/webui-hq/src/domain/fleet-topology.ts` against `HqSessionAgentLiveStatus` in `packages/core/src/hq/protocol/session.ts`; working statuses must remain visible, while `'offline'` from `markRetained` is idle.
- When adding required preference fields, check both `DEFAULT_PREFS` and per-field validation in `mergeWithDefaults` in `packages/webui-hq/src/data/local-prefs.ts`.
- Treat `pnpm-workspace.yaml` `overrides:` as this repository’s authoritative override surface; root `package.json` top-level `overrides` is not pnpm configuration, and fresh version floors must satisfy `minimumReleaseAge` or have a matching `minimumReleaseAgeExclude`.

## Runtime and Data Contracts

- When consumers use `spec.model ?? fallback`, verify blank-string normalization at the producer; check `resolveRefinerTargetSpecs` in `packages/core/src/execution/refiner-target.ts`, since `??` does not replace empty strings.
- In never-throw provider wrappers, ensure `onError` observer exceptions are caught within notification rather than escaping or causing duplicate `provider_error` notifications.
- For parser rewrites, validate generated syntax against the consuming grammar, including quotes, comments, and bracket depth; check `splitTableFormDependency` in `packages/techstack/src/adapters/rust.ts` against `parseTomlKeyValue` in `packages/techstack/src/adapters/parse-utils.ts`.
- For side-request adaptation, compare capability predicates with the main path and verify idempotent, unchanged-input behavior of `adaptDocumentsForModel` in `packages/core/src/utils/document-blocks.ts`.
- For SessionEvent rollouts, search the event literal across `packages/core/src/types/session-events.ts`, surface-specific writers, and summary/load folds; require one writer per surface and one fold per consumer, with full replay and legacy load branches mutually exclusive.
- Check actual validators against generated output. Preserve spaces in requirement ranges, and ensure manifest paths emitted by `dep-watcher.ts` satisfy `acceptManifestCandidate` in `techstack-mailbox-consumer.ts`.
- A case-sensitive `includes()` or `indexOf()` guard can defeat a subsequent case-insensitive regex. Test the complete producer output space, not only canonical examples.
- Before reporting lost error logging, enumerate reachable throw sites, wrapper class identity, catch boundaries, and existing upstream structured warnings.
- Inspect all call sites when inserting positional parameters before optional callbacks; argument shifts can silently change trust or security semantics.
- Preserve intended numeric semantics: `Infinity` may be valid, while `NaN` survives `??` and negative values can alter `slice` or SQL `LIMIT`.

## Lifecycle and Concurrency

- Reset deterministic cached verdicts at each attempt’s start. For MCP, verify `protocolVersionRefusal` resets in `attemptConnectSlot` before `ensureConnected` can expose stale state.
- Normalize teardown promises to never-rejecting completions before `Promise.race`, unref grace timers, and avoid awaiting tracking APIs inside spawn `try` blocks; tracking failures must not masquerade as spawn failures.
- Validate batch width and loop progress: `pendingTasks.splice(0, maxConcurrentTasks)` with zero can create empty batches and starve progress.
- Check AbortController identity and `close()` semantics together. Superseded SSE callbacks must not mutate stream signals, pending rejections, or shared cleanup.
- Keep `Object.defineProperty` entries enumerable when iterated and configurable when removed. `Object.hasOwn` includes own properties whose value is `undefined`.
- Inspect receiver-bound delegation for `: this` or same-instance returns; bound methods may return the original object and discard overrides.

## Tests and Behavioral Verification

- For Node builtin mocks, match the production import/export shape, stub every accessed return-object member, emit awaited events, and inspect unmocked resolution branches for throws or early returns.
- Resolve expected values and teardown counts from live fixtures and execution order. Require regression tests to distinguish the intended failure from setup failure and exercise production wiring.
- Pin MCP `initialize` fixtures to `SUPPORTED_PROTOCOL_VERSIONS`; isolate deliberate mismatches so protocol rejection does not mask unrelated behavior.
- Verify JSON-RPC-to-tool-result assertion changes against `packages/mcp/src/server-dispatch.ts`, including `InvalidToolArgumentsError`, `isError: true`, path prefixes, and message capping.
- Check gitignore negation against parent exclusion in `packages/tools/src/codebase-index/gitignore.ts`: evaluate ancestors with the full rule list, preserve explicit directory re-inclusion, and pin exact differential disagreements with `toEqual`.
- Resolve conditional backup retention in `packages/tools/src/dead-code/fix.ts` before judging rollback/undo assertions; tests alone cannot establish the retention branch.
- For dead-code tests combining `verify: 'none'` with `verifyCommand`, confirm `applyDeadCodeFixes` still runs the extra command in `packages/tools/src/dead-code/fix.ts`.

## UI and Security Semantics

- Validate sandbox gates against their own contracts and tests, not sibling-wrapper symmetry. Browser denial in `packages/core/src/sandbox/browser-rule.ts` requires `mode === 'enforced' && backend === 'container'`.
- Check mount semantics before flagging combobox expansion inside closed Radix dialogs; `aria-activedescendant` must match the rendered options’ exact ordering.
- Detect tab-sweep wrap-around by element identity or unique selector path, not duplicate labels; require enough stops to reject empty sweeps.
- Parse computed color alpha rather than matching literal `transparent`; browsers may serialize transparency as `rgba(0, 0, 0, 0)`.