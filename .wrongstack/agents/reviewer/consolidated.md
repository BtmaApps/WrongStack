# Reviewer Agent Instructions

## Evidence and Coverage

- Verify findings, assertions, and clean verdicts against current on-disk source, not stale diffs or snippets. Cite live `file:line` locations.
- Trace changed contracts through producers, validators, transforms, consumers, production wiring, and tests; mock-only behavior does not establish production correctness.
- Recover hidden changed ranges with targeted reads or tool-output logs. If coverage remains incomplete, identify unread anchors and report `completion: "partial"`.
- Use `{"findings": []}` only when no defect is confirmed and coverage is complete. Check missing modules by explicit path; an empty brace-expansion `glob` is inconclusive.
- Treat comments, documentation, tests, and nearby code as leads rather than proof; confirm behavior from the actual implementation and reachable control flow.

## Imports, Types, and Configuration

- Verify cross-package imports against source signatures and package `exports`; for `@wrongstack/core/*`, inspect `packages/core/package.json` and the source barrel, distinguishing runtime values from type-only exports.
- For removed re-exports, enumerate importers of the re-exporting module and read complete multiline import blocks; symbol-wide or single-line searches are insufficient.
- Enumerate every discriminated-union variant before approving handler fall-through or exhaustive switches.
- When adding an `ACPSessionErrorKind` in `packages/acp/src/client/acp-session-types.ts`, update `mapACPKind` in `packages/acp/src/integration/acp-subagent-runner.ts`, then verify `packages/acp/src/client/acp-session-prompt.ts` actually throws that kind. Some conditions, such as `'aborted'`, resolve as `cancelled` and never reach the mapper.
- Validate attending-status filters in `packages/webui-hq/src/domain/fleet-topology.ts` against `HqSessionAgentLiveStatus` in `packages/core/src/hq/protocol/session.ts`; working statuses remain visible, while `'offline'` from `markRetained` is idle.
- When adding required preference fields, update both `DEFAULT_PREFS` and per-field validation in `mergeWithDefaults` in `packages/webui-hq/src/data/local-prefs.ts`.
- Treat `pnpm-workspace.yaml` `overrides:` as authoritative; root `package.json` top-level `overrides` is not pnpm configuration. New version floors must satisfy `minimumReleaseAge` or have a matching exclusion.
- For dependency removals, attribute surviving lockfile references to their importer blocks, never by line proximity. A removed dependency with zero lockfile references usually confirms pnpm regeneration; remaining references may belong to another package.

## Runtime and Data Contracts

- When consumers use `value ?? fallback`, verify producers normalize blank strings; nullish coalescing does not replace `''`.
- In never-throw wrappers, catch observer callback failures inside notification so they neither escape nor trigger duplicate error notifications.
- For parser rewrites, validate emitted syntax against the consuming grammar, including quotes, comments, spacing, and bracket depth.
- Compare side-request capability predicates with the main path and verify adaptation is idempotent for unchanged input.
- For event rollouts, search the event literal across type definitions, surface writers, and load/summary folds. Require correct production writers and mutually exclusive replay versus legacy-load branches.
- Check generated output against actual validators. Preserve spaces in requirement ranges and ensure generated manifest paths satisfy consumer acceptance rules.
- A case-sensitive `includes()` or `indexOf()` guard can defeat a later case-insensitive regex; test the full producer output space.
- Before reporting lost error logging, enumerate reachable throw sites, wrapper identity, catch boundaries, and existing upstream structured warnings.
- Inspect every call site when positional parameters are inserted before optional callbacks; shifted arguments can silently change trust or security behavior.
- Preserve intended numeric semantics: `Infinity` may be valid, `NaN` survives `??`, and negatives can alter `slice` or SQL `LIMIT`.
- Clamp environment-derived timer delays with `Math.min(value, 2_147_483_647)` after finite/minimum validation. Node clamps larger `setTimeout` or `setInterval` values to about 1 ms, causing floods.

## Lifecycle and Concurrency

- Reset deterministic cached verdicts at each attempt’s start; stale connection-refusal state must not leak into retries.
- Normalize teardown promises to never-rejecting completions before `Promise.race`, unref grace timers, and avoid awaiting tracking APIs inside spawn `try` blocks.
- Validate batch width and loop progress; `splice(0, 0)` can create empty batches and starve processing.
- Check `AbortController` identity and `close()` semantics together. Superseded callbacks must not mutate shared signals, pending rejections, or cleanup.
- Keep `Object.defineProperty` entries enumerable when iterated and configurable when removed. `Object.hasOwn` includes own properties valued `undefined`.
- Inspect receiver-bound delegation for methods returning `this`; bound methods may return the original object and discard wrapper overrides.

## Tests and Behavioral Verification

- For Node builtin mocks, match production import/export shape, stub every accessed return-object member, emit awaited events, and inspect unmocked branches for throws or early returns.
- Resolve expected values and teardown counts from live fixtures and execution order. Regression tests must distinguish the intended failure from setup failure and exercise production wiring.
- Pin MCP `initialize` fixtures to `SUPPORTED_PROTOCOL_VERSIONS`; isolate deliberate mismatches so protocol rejection does not mask unrelated behavior.
- Verify JSON-RPC tool-result assertions against `packages/mcp/src/server-dispatch.ts`, including `InvalidToolArgumentsError`, `isError: true`, path prefixes, and message caps.
- For gitignore negation, evaluate ancestors using the complete rule list, preserve explicit directory re-inclusion, and pin differential disagreements with exact `toEqual` assertions.
- Resolve conditional backup retention in `packages/tools/src/dead-code/fix.ts` before judging rollback or undo assertions.
- When tests combine `verify: 'none'` with `verifyCommand`, confirm `applyDeadCodeFixes` still runs the extra command.

## Architecture, Documentation, and UI

- Before removing an entry from `architecture/test-only-exports.json`, search repo-wide for static imports of the symbol. Dynamic property access may leave zero static importers and make removal correct bookkeeping.
- Resolve documentation links against target headings. GitHub anchors remove punctuation such as `&`, `/`, `+`, and em dashes, while retained spaces become hyphens.
- Validate changed numeric documentation claims against source-derived catalogs such as `docs/current-catalog.md` and live surfaces such as `website/index.html`, not the prose being replaced.
- Read CSS token definitions before changing color wrappers. `packages/simpleui/src/styles.css` stores full color values, so use `var(--token)`, not `hsl(var(--token))`; `packages/webui` may use HSL-component triples.
- Validate sandbox gates against their own contracts and tests, not sibling-wrapper symmetry. Browser denial in `packages/core/src/sandbox/browser-rule.ts` requires `mode === 'enforced' && backend === 'container'`.
- For browser policy changes, trace `browserPrivateOrigins(root)`, manager caching, slash-command refresh, and `BrowserSessionManager` before accepting claims that allowlist updates affect existing sessions immediately.
- Treat `timeoutMs` with `managesOwnTimeout: true` as established for browser and subprocess tools that can legitimately run for several minutes.
- Check mount semantics before flagging combobox expansion inside closed Radix dialogs; `aria-activedescendant` must match rendered option ordering.
- Detect tab-sweep wrap-around by element identity or unique selector path, not duplicate labels, and require enough stops to reject empty sweeps.

_(truncated at 8192 bytes — the next optimization pass must shorten it)_