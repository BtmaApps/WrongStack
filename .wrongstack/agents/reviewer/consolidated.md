# Reviewer Agent Instructions

## Evidence and Coverage

- Before reviewing claimed work, prove it exists: run `git status -- <target paths>` plus an `rg` for feature identifiers. Zero target changes, for example after `aborted_by_parent`, means verdict `request changes`. Reserve `needs verification` for code that is present but unchecked.
- Verify findings and clean verdicts against current on-disk source, not stale diffs or snippets. Cite live `file:line` locations.
- Trace changed contracts through producers, validators, consumers, production wiring and tests. Mock-only behavior does not establish production correctness.
- Do not trust a single `grep` render. It may report `count=N` but show only 3 match groups.
  - For exhaustive usage checks, grep the saved log under `C:\Users\ersin\.wrongstack\tool-output\`, or re-`read` with explicit `offset` windows.
  - If coverage stays incomplete, list the unread anchors and report `completion: "partial"`.
- Use `{"findings": []}` only when no defect is confirmed and coverage is complete.
- Check missing modules by explicit path. An empty brace-expansion `glob` is inconclusive.
- Treat comments, docs, tests and nearby code as leads. Confirm behavior from the implementation and reachable control flow.
- When a new required key is added, find missed fixtures by grepping for a stable sibling key, not the new key. Recount length assertions such as `Object.keys(SETTINGS_DEFAULTS).toHaveLength(N)` from the source literal, skipping comment lines.

## Project Contracts

- Before flagging unhandled rejections or double-submits in `packages/vibeui`, trace `request(...)` calls to `packages/vibeui/src/lib/use-panel-requests.ts`. It resolves `null` instead of rejecting, dedupes by frame type, and cancels in-flight requests on session switch.
- Validate new ws payloads against the server validators, reading every branch. For example, check `validateMailboxSendPayload` in `packages/webui-server/src/server/ws-mailbox-validation.ts`, and confirm the reply frame carries `requestId` and `success`.
- For state-owning refactors such as `SessionSwitch` in `packages/vibeui/src/lib/session-switch.ts`, every exit (settle, cancel, timeout) must release target, lock, timer and held fallback together.
- When adding an `ACPSessionErrorKind`:
  - Update `mapACPKind` in `packages/acp/src/integration/acp-subagent-runner.ts`.
  - Verify `packages/acp/src/client/acp-session-prompt.ts` actually throws that kind.
  - Note that `'aborted'` resolves as `cancelled` and never reaches the mapper.
- Validate attending-status filters in `packages/webui-hq/src/domain/fleet-topology.ts` against `HqSessionAgentLiveStatus`. `'offline'` from `markRetained` counts as idle.
- New required prefs need both `DEFAULT_PREFS` and per-field validation in `mergeWithDefaults` in `packages/webui-hq/src/data/local-prefs.ts`.
- Treat `pnpm-workspace.yaml` `overrides:` as authoritative; root `package.json` `overrides` is not pnpm config. New version floors must satisfy `minimumReleaseAge` or have an exclusion.
- Attribute lockfile references to importer blocks, never by line proximity.
- For `@wrongstack/core/*` imports, check `packages/core/package.json` `exports` and the source barrel, distinguishing runtime values from type-only exports.
- For removed re-exports, read complete multiline import blocks of every importer.
- Before removing an entry from `architecture/test-only-exports.json`, search repo-wide for static imports of the symbol.
- Browser denial in `packages/core/src/sandbox/browser-rule.ts` requires `mode === 'enforced' && backend === 'container'`.
- `timeoutMs` with `managesOwnTimeout: true` is the established pattern for long-running browser and subprocess tools.
- `packages/simpleui/src/styles.css` tokens hold full colors, so use `var(--token)`, not `hsl(var(--token))`.

## Runtime and Data Semantics

- Enumerate every discriminated-union variant before approving fall-through or exhaustive switches.
- `value ?? fallback` does not replace `''`, so producers must normalize blank strings. `NaN` also survives `??`.
- Negative numbers can alter `slice` or SQL `LIMIT`.
- Clamp env-derived timer delays with `Math.min(value, 2_147_483_647)` after finite and minimum validation. Larger values make Node fire after about 1 ms.
- A case-sensitive `includes()` or `indexOf()` guard can defeat a later case-insensitive regex. Test the full producer output space.
- For parser rewrites and generated output, validate against the consuming grammar or validator, including quotes, comments, spacing, bracket depth and path rules.
- When positional parameters are inserted before optional callbacks, inspect every call site. Shifted arguments can silently change trust behavior.
- For event rollouts, search the literal across types, production writers and load/summary folds. Replay and legacy-load branches must be mutually exclusive.
- Before reporting lost error logging, enumerate throw sites, catch boundaries and existing upstream warnings.
- In never-throw wrappers, catch observer callback failures inside the notification code.

## Lifecycle and Concurrency

- Reset cached deterministic verdicts at the start of each attempt so stale state does not leak into retries.
- Normalize teardown promises to never-reject before `Promise.race`, and unref grace timers.
- Check `AbortController` identity together with `close()` semantics. Superseded callbacks must not mutate shared signals or cleanup.
- Validate batch width and loop progress; `splice(0, 0)` yields empty batches.
- `Object.defineProperty` entries must be enumerable when iterated and configurable when removed. `Object.hasOwn` includes own properties whose value is `undefined`.
- Bound methods returning `this` may return the original object and discard wrapper overrides.

## Tests

- Under `bun --bun vitest` on Windows, `node -e "<code>" -- <args>` drops the first positional argument. Write a `.cjs` script into the sandbox and assert on `process.argv.slice(2)`. See `packages/tools/tests/exec-autonomy.test.ts`.
- In `packages/vibeui/tests/browser-smoke.mjs`:
  - Strict count assertions only hold with the page's single-socket topology, because of the `for (const client of clients)` broadcast loops.
  - An unmatched `page.clock.install()` is acceptable only if later steps don't rely on app-side real timers.
  - Verify canvas-sampled CSS tokens exist in `packages/vibeui/src/app/globals.css`. An empty `getPropertyValue` silently reuses the prior `ctx.fillStyle`.
- For Node builtin mocks:
  - Match the production import shape.
  - Stub every accessed member and emit the events the code awaits.
  - Inspect unmocked branches for throws or early returns.
- Regression tests must distinguish the intended failure from setup failure and exercise production wiring. Take expected values from live fixtures and execution order.
- Pin MCP `initialize` fixtures to `SUPPORTED_PROTOCOL_VERSIONS`.
- Verify tool-result assertions against `packages/mcp/src/server-dispatch.ts` (`InvalidToolArgumentsError`, `isError: true`, message caps).
- For gitignore negation, evaluate ancestors against the full rule list and keep explicit directory re-inclusion.
- Dead-code fixes:
  - Resolve conditional backup retention in `packages/tools/src/dead-code/fix.ts` before judging rollback assertions.
  - `applyDeadCodeFixes` still runs `verifyCommand` when `verify: 'none'`.

## Docs and UI

- Resolve doc links against target headings. GitHub anchors drop `&`, `/`, `+` and em dashes, and turn spaces into hyphens.
- Validate numeric doc claims against `docs/current-catalog.md` and `website/index.html`, not the prose being replaced.
- For tab-sweep tests, detect wrap-around by element identity, not label, and require enough stops to reject empty sweeps.
- `aria-activedescendant` must match the rendered option order.