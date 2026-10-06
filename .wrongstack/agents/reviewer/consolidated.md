# Reviewer Agent Instructions

## Evidence and Coverage

- Treat task-bundle diff hunks and review bundles as potentially stale or incomplete. Verify every finding, changed assertion, and all-clear against current on-disk ranges, and cite live `file:line`; added-line text is not proof of disk state.
- Trace changed contracts end to end: producer, validator or transform, consumer, boot/wiring, and tests. Mock-only paths do not establish production behavior.
- Never issue an all-clear while a changed range remains hidden. Recover omitted content from `~/.wrongstack/tool-output/…-read-….log` or targeted grep with `context_lines: 40+`; otherwise identify uncovered ranges and set `completion: "partial"`.
- Use `{"findings": []}` only when no defect is confirmed and coverage is complete. Verify missing modules with explicit paths; zero results from brace-expansion `glob` are inconclusive.
- Resolve documentation links, heading anchors, and removed index targets against live files. Resolve `@wrongstack/core/*` through `packages/core/package.json` `exports`, then verify the source barrel and exact value/type exports; a type-only re-export cannot satisfy a runtime import.
- For `.reports/**` research, check fetch and write independently. Treat policy denials as binding, snippets as leads, and absent fetch as partial with exact successor URLs. A listed capability does not imply a registered tool; request a worker with the required schema and never substitute recall for fetched evidence.

## Runtime Contracts and Lifecycle

- Trace new fields, state resets, and branch initialization through production boot and use paths. Clear deterministic cached verdicts at the start of every attempt, not only on failure; for MCP, verify `protocolVersionRefusal` is reset in `attemptConnectSlot` before `ensureConnected` can expose stale state.
- When changing `cfg?.['enabled'] === true` to `cfg?.['enabled'] !== false`, verify `setupDepWatcherBridge` returns the raw `dwCfg` even when disabled, every downstream `cfg['key']` read uses optional chaining, and sibling gates in `packages/cli/src/wiring/dep-watcher.ts` and `dep-watcher-bridge.ts` give absent, false, and truthy fragments identical semantics.
- For teardown grace, normalize every tracked promise to a never-rejecting completion with `then(_,_)` before `Promise.race`, `unref()` bound timers, and invoke tracking APIs without `await` inside the spawn `try`; an awaited tracking rejection can masquerade as a successful spawn. Warn when optional `session.ended.waitUntil` is absent while work is in flight.
- Keep `setOwnValue`/`Object.defineProperty` entries in `packages/plugins/src/cost-tracker/index.ts` enumerable for `Object.keys()` and configurable for teardown. When hardening `Record` keys, use `Object.defineProperty` rather than assignment, and remember `Object.hasOwn` sees own-`undefined` keys; closure-local maps that are not JSON-restored legitimately lack such keys.
- In extracted batch-concurrency loops, validate both splice width and loop progress. Passing `0` to `pendingTasks.splice(0, maxConcurrentTasks)` creates an empty batch and can starve progress through already-resolved promises.
- Verify AbortController supersession against `close()` semantics. If `close()` aborts without replacing `this.abortController`, identity checks remain valid after close; stale `readSSEBody` and SSE callbacks must still skip `streamSignal`, `rejectStreamPending`, and shared cleanup when `this.abortController !== controller`.
- Check intended numeric semantics before flagging nonfinite values: explicit `Infinity` may be valid, while `NaN` bypassing `??` and negatives reaching `slice` or SQL `LIMIT` are unsafe unless explicitly handled.

## Errors, APIs, and Data Contracts

- Before flagging a removed `log.warn` or an `instanceof` terminal path, enumerate every throw site. Confirm the error occurs inside the reviewed `try`, class identity survives wrappers, and it reaches the catch; check throw sites and upstream logs for existing structured warnings before claiming evidence loss.
- Compare producer and consumer contracts against both documentation and the consumer’s actual validator. For mailbox text, ensure `dep-watcher.ts` emits a `File:` path accepted by `acceptManifestCandidate` in `techstack-mailbox-consumer.ts`; parse generator output such as spaced requirement ranges with a grammar that preserves spaces rather than `\S+`.
- A case-sensitive `String.includes()` or `indexOf()` guard makes a following case-insensitive regex inert on noncanonical casing. Verify regexes against the generator’s full output space and actual syntax, not a happy-path sample or doc comment.
- When converting `import type { X }` to a mixed type/value import from `@wrongstack/core/*`, verify the value is exported by the package barrel and has a real runtime consumer. For new positional parameters before optional callbacks, inspect every `codebase-incoming-calls` argument position and default; a truthy object accidentally passed as `trusted` can bypass `createSandboxMcpGate`.
- Read live values in `packages/mcp/src/constants.ts` before judging retry refactors. `MCP_CONSTANTS.RECONNECT.BACKOFF_MULTIPLIER` is `2`, preserving `500 * 2 ** attempt`, while `RECONNECT.BASE_DELAY_MS` is the separate `1000` across-cycle clock; keep the within-cycle base in `CONNECT_ATTEMPT_BASE_MS`.
- For receiver-bound delegation, inspect contracts declaring `: this` or same-instance returns; methods bound to the original receiver can return the raw object and silently shed overrides.

## Tests and Assertions

- Pin every MCP `initialize` fixture to a revision in `SUPPORTED_PROTOCOL_VERSIONS`; isolate deliberate mismatches in dedicated tests so authentication or tool behavior is not masked by `assertSupportedServerProtocolVersion`.
- Resolve expected values, indices, lengths, and teardown-handler counts against the live fixture and actual push order, not review-bundle text or comments. Distinguish unconditional pushes from conditional disposers.
- When JSON-RPC error assertions become tool-result refusals, verify `packages/mcp/src/server-dispatch.ts` still converts `InvalidToolArgumentsError` to `{ content: [{ type: 'text', text: err.message }], isError: true }`. Assert path-prefixed entries and `(+N more)` capping from the same message builder.
- Detect browser tab-sweep wrap-around only when the first sampled element repeats by identity or unique selector path; duplicate `tag:name` labels are not sentinels. Also require a minimum `stops` count so a nearly empty sweep cannot pass.
- Do not regex computed colors for literal `transparent`; Chromium may serialize it as `rgba(0, 0, 0, 0)`. Parse alpha and assert the intended opacity or nonvisibility.
- Require tests to distinguish the regression from setup failure, match live source syntax, and exercise production wiring. Fixture-mutated configuration must exist in live defaults and be read at call time when that is part of the contract.

## UI, Sandbox, and Platform

- In `packages/tools/src/builtin.ts`, duplicated `browserTierGate(tool)` wrapper objects across tier arrays are not an identity bug when `builtinTools` creates fresh objects and consumers match by name. Check `packages/core/src/sandbox/browser-rule.ts`: browser denial requires `mode === 'enforced' && backend === 'container'`.
- Treat a sandbox gate that permits only `mode === 'off'` as intentional fail-closed hardening when `SandboxMode` and `packages/core/tests/sandbox/mcp-gate.test.ts` pin that contract; do not flag asymmetry from the exec wrapper alone.
- For a combobox inside a closed Radix `DialogContent`, verify mount semantics before flagging constant `aria-expanded="true"`. Ensure every `aria-activedescendant` index refers to the exact array and ordering used to stamp option IDs; filtering or reordering otherwise creates dangling references.

_(truncated at 8192 bytes — the next optimization pass must shorten it)_