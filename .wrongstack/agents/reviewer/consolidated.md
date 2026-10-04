# Reviewer Agent Instructions

## Evidence and Coverage

- Confirm findings against current on-disk source, not intermediate diff hunks or incomplete bundles. Read the exact defect location and cite live `file:line`; trace the relevant producer, consumer, and tests before reporting.
- Never issue an all-clear while changed ranges remain hidden: recover `[artifact middle omitted]` content from the printed `~/.wrongstack/tool-output/…-read-….log` path or single-anchor `grep` with `context_lines` 40+; otherwise identify uncovered ranges and set `completion: "partial"`.
- Use `{"findings": []}` when no defect is confirmed, but do not imply complete coverage when evidence is missing.
- Verify missing modules with explicit paths on disk. A zero-result brace-expansion `glob` is inconclusive because some backends do not expand braces.
- Resolve added documentation links and heading anchors against live files; verify removed index targets still exist before calling their removal link rot.

## Blocked Research and Deliverables

- For `.reports/**` grounded-research tasks, check fetch and write capabilities independently. Report each missing surface in the re-dispatch request.
- Distinguish capability policy from tool registration. A denial listing `allowed: fs.read, fs.write, net.outbound, coordination.result.submit` does not expose those tools; request a worker whose registered schema supplies the missing fetch/write surfaces, not new authorization.
- Treat policy denials as binding. If `session_note` is denied, use sanctioned `submit_result`; do not retry the denied tool or bypass it through `mailbox`.
- Treat `search` snippets as leads, not fetched sources. After one evidence-free round without a fetch tool, submit `completion: "partial"` with an exact successor fetch list: repository, raw README, `api.github.com` metadata, `/releases/latest`, and documentation root.
- Never substitute training-memory recall for required fetched evidence, even under pressure to conclude. Keep recall out of the report and label any recall included in the handoff explicitly unverified.

## Imports and Delegation

- Resolve `@wrongstack/core` subpaths through `packages/core/package.json` `exports`. `"./agent"` maps to `dist/core/index.js`, so `'@wrongstack/core/agent'` symbols must be re-exported from `core/index.ts`, not merely defined in `core/agent.ts`. Check with `grep '<symbol>|<source-module>' packages/core/src`.
- For extracted modules and new barrel exports, verify target files and exact exported names. Check overlapping `export *` sources for ambiguous names before approving.
- Before approving Proxy delegation that binds methods to the original receiver, inspect the contract for `: this` or same-instance returns. Such methods can return the raw object and shed overrides; check `delegateWithOverrides` in `packages/vector-memory/src/sage-port-wrapper.ts` against `withTraceId(): this` in `packages/sage/src/memory-port.ts`.

## Runtime Contracts and Feature Gates

- Trace changed fields, state resets, and branch initialization through production paths; mock-only tests do not establish live wiring.
- Validate paired feature gates against actual parser and boot materialization, not just contrasting `!flags['x']` and `flags['x'] === true` syntax.
- For `flags.tui === true` gates in `packages/cli/src/wiring/**`, inspect `packages/cli/src/boot.ts`: launch-menu TUI selection, `quick`, and `--goal`/`--ask` via `boot/goal-tui-default.ts` explicitly set the flag. Do not infer a mismatch merely because `shouldCaptureTuiStartup` defaults on.
- Read helper contracts before reporting missing caller validation. `parseAuthMenuIndex` in `packages/cli/src/auth-menu/index-input.ts` already requires `Number.isSafeInteger(index) && index > 0`; an undefined check and upper bound complete one-based lookup validation.
- Check intended numeric semantics before flagging nonfinite values. `clampBudget` in `packages/tui/src/checkpoint-retention.ts` permits explicit unbounded `Infinity`, pinned by `packages/tui/tests/checkpoint-nan-budget.test.ts`; elsewhere verify validation before `slice` or SQL `LIMIT`, since negative slicing and `NaN` bypassing `??` can be defects.

## Tests and Cross-System Invariants

- Verify fixture-mutated configuration exists in live defaults and is read at call time rather than captured during construction; for LSP configuration, inspect `packages/plug-lsp/src/config.ts` `DEFAULT_CONFIG`/`mergeConfig` and `deps.cfg.<key>`.
- Require assertions to distinguish correct behavior from the regression. Source-pinning regexes must match live syntax and relevant runtime paths; assertions that coerce objects to `"[object Object]"` do not prove truncation bounds.
- For transcript markers and joins, check `packages/bench/src/trace-eval.ts` raw serialized-substring matching and `SessionEventAttribution` in `packages/core/src/types/session-events.ts`; uniformly absent `agentId` remains symmetric, unlike one-sided attribution.
- Validate roster and skill-count claims against `FLEET_ROSTER` in `packages/core/tests/coordination/agent-catalog.test.ts` and `glob packages/core/skills/*/SKILL.md`, never remembered counts.
- Check live `vitest.config.ts` before crediting exclusion “allowlists”: exclusions are additive, so a broad exclusion must actually be removed.

## UI and Settings Review

- In `packages/webui`, check `outline-none` changes against `packages/webui/src/index.css` global `:focus-visible`; suppressing its token ring requires a replacement visible focus style, while removing suppression restores accessibility.
- Treat newly reachable filtered arrays as potentially empty. Check selection guards, index clamping, element types, and React key uniqueness together.
- Preserve React hook order and timer cancellation; use stable revisions or memoization rather than fresh computed values in effect dependencies.
- Validate numeric preferences across serve, seed, update, and broadcast paths, not only `prefs.update`.
- For SimpleUI toggles, verify model, defaults, parser, equality, catalog, row binding, and `BOOLEAN_PREF_KEYS` in `packages/webui-server/src/server/ws-payload-preferences.ts`; unlisted update keys are rejected.
- Use `CONFIG_BEHAVIOR_DEFAULTS.autonomy` in `packages/core/src/storage/config-loader.ts` as the canonical TUI autonomy default, and verify settings hydration, runtime propagation, and persistence end to end.