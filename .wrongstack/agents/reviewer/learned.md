# Learned instructions for `reviewer`

> Project-specific learning data for the `reviewer` agent. Each entry is a directive — read it as an instruction, not a journal entry. Entries are re-derived on every capture, so this file is always a current, structured snapshot of what this agent has learned.

## What to avoid

<!-- learned-stamp: category=warning; capturedAt=2026-09-26T14:26:21.189Z; skill=chimera; applied=1; wins=1; skipped=1; skippedWins=1 -->
- **When a SimpleUI preference toggle is added, close the contract in one pass before calling it dead wiring: check the field/default/`parsePrefs` triple in `packages/simpleui/src/lib/prefs-model.ts`, its key in `shallowEqualPrefs` in `packages/simpleui/src/hooks/use-settings.ts` (otherwise `isAtDefaults` stays stale), the catalog id in `packages/simpleui/src/lib/settings-catalog.ts`, the `ToggleRow` `settingId`/`hidden` binding in `packages/simpleui/src/settings-panel.tsx`, and that the same key appears in `BOOLEAN_PREF_KEYS` in `packages/webui-server/src/server/ws-payload-preferences.ts` — the server rejects unlisted `prefs.update` keys, so a client-only addition silently never persists.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `parsePrefs`
  - *How:* `packages/simpleui/src/lib/prefs-model.ts`
  - *How:* `shallowEqualPrefs`
  - *How:* `packages/simpleui/src/hooks/use-settings.ts`
  - *How:* `isAtDefaults`
  - *How:* `packages/simpleui/src/lib/settings-catalog.ts`
  - *How:* `ToggleRow`
  - *How:* `settingId`
  - *How:* `hidden`
  - *How:* `packages/simpleui/src/settings-panel.tsx`
  - *How:* `BOOLEAN_PREF_KEYS`
  - *How:* `packages/webui-server/src/server/ws-payload-preferences.ts`
  - *How:* `prefs.update`

## What to do

<!-- learned-stamp: category=convention; capturedAt=2026-09-26T12:51:27.951Z; skill=testing; applied=12; wins=12; skipped=17; skippedWins=17 -->
- **Always grep test files for the new option/constant identifiers whenever a retention or eviction default flips from retain-forever to bounded (e.g. `nonTerminalMaxAgeMs` / `REVIEW_STORE_NON_TERMINAL_RETENTION_MS` in `packages/core/src/plugins/review-store-maintenance.ts`) — require tests pinning both sides (kept under cap, evicted over cap) plus the disable sentinel (`Number.POSITIVE_INFINITY`), because data-deletion regressions produce no failing signal otherwise.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `nonTerminalMaxAgeMs`
  - *How:* `REVIEW_STORE_NON_TERMINAL_RETENTION_MS`
  - *How:* `packages/core/src/plugins/review-store-maintenance.ts`
  - *How:* `Number.POSITIVE_INFINITY`

<!-- learned-stamp: category=convention; capturedAt=2026-09-26T12:51:27.951Z; skill=code-review; applied=11; wins=11; skipped=18; skippedWins=18 -->
- **Before flagging an added return field on a store interface (e.g. `removedNonTerminal` on `ReportStore.compact` in `packages/core/src/plugins/review-report-store.ts`) as a break, grep for `implements <Interface>` — when the store class is the sole implementer and consumers destructure named fields, the change is purely additive; only exact `toEqual` assertions on the returned object can break.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `removedNonTerminal`
  - *How:* `ReportStore.compact`
  - *How:* `packages/core/src/plugins/review-report-store.ts`
  - *How:* `implements <Interface>`
  - *How:* `toEqual`

<!-- learned-stamp: category=convention; capturedAt=2026-09-26T13:15:12.690Z; skill=chimera; skipped=22; skippedWins=22 -->
- **When a diff adds a defaulted option parameter to a **module-private** async function and forwards it to a core helper, grep the type name for its total uses and check the reference graph for callers before accepting it — a private function reached only through an injectable `dep = realFn` default is called via the injected name, so the diff must also change that invocation or the new option is dead wiring that silently preserves core defaults; cite the parameter line only after reading the actual call site.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `dep = realFn`

<!-- learned-stamp: category=convention; capturedAt=2026-09-26T14:17:07.511Z; applied=1; wins=1; skipped=5; skippedWins=5 -->
- **When a diff adds a field to `packages/cli/src/live-settings-input.ts` (the `LiveSettingsInput` contract shared by `saveSettings`/`applyLiveSettings`), close the two-sided contract check inside `packages/cli/src/boot/tui-settings-adapter.ts` before reporting: (1) the hydration producer around mapping `cfg.features?.<camelCase> !== false` into the field, and (2) the persist consumer around mapping it back with an `if (s.<field> !== undefined) feats.<camelCase> = ...` guard. Grep `featureToolCoach|featureModelsRegistry|featureSkills` to find both sides in one pass — a declaration with only one side is the dead-wiring signal.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `packages/cli/src/live-settings-input.ts`
  - *How:* `LiveSettingsInput`
  - *How:* `saveSettings`
  - *How:* `applyLiveSettings`
  - *How:* `packages/cli/src/boot/tui-settings-adapter.ts`
  - *How:* `cfg.features?.<camelCase> !== false`
  - *How:* `if (s.<field> !== undefined) feats.<camelCase> = ...`
  - *How:* `featureToolCoach|featureModelsRegistry|featureSkills`

<!-- learned-stamp: category=convention; capturedAt=2026-09-26T13:48:52.750Z; skill=chimera; skipped=11; skippedWins=11 -->
- **When a diff replaces whole-input matching with chunked/windowed scanning (e.g. the `EVIDENCE_MATCH_WINDOW` loop in `packages/plugins/src/evidence-analyzer/index.ts`), always check matches that *cross* a chunk boundary: a 1-char overlap with an index-0 skip deduplicates but silently drops any match spanning the seam — in a security scanner this is a deterministic evasion vector at `k*WINDOW-1` offsets. Require overlap ≥ max match length or absolute-start-based dedup.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `EVIDENCE_MATCH_WINDOW`
  - *How:* `packages/plugins/src/evidence-analyzer/index.ts`
  - *How:* `k*WINDOW-1`

<!-- learned-stamp: category=convention; capturedAt=2026-09-26T12:57:31.984Z; skill=chimera; applied=1; wins=1; skipped=25; skippedWins=25 -->
- **When a diff threads new options into `observeJevClient` or documents Jev record contents, validate each claim against `packages/core/src/typesafe/activity.ts` in the same pass — `ObserveJevClientOptions` field names, `tailEntry`'s strip-before-push into the in-process ring, the `[redacted]`/`[truncated:…]` markers, `CONTENT_MAX_CHARS`, and `LOG_DIR_ENV` — because doc and file are one contract pair and prose-only reading yields false findings. For env-override helpers like `logContentWanted` in `packages/core/src/typesafe/resolve.ts` that branch on `env[k]?.trim() !== undefined`, file the empty-string divergence only when a realistic off-spelling (`0`, `false`, `off`) actually misbehaves, not when empty legitimately means "unset".**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `observeJevClient`
  - *How:* `packages/core/src/typesafe/activity.ts`
  - *How:* `ObserveJevClientOptions`
  - *How:* `tailEntry`
  - *How:* `[redacted]`
  - *How:* `[truncated:…]`
  - *How:* `CONTENT_MAX_CHARS`
  - *How:* `LOG_DIR_ENV`
  - *How:* `logContentWanted`
  - *How:* `packages/core/src/typesafe/resolve.ts`
  - *How:* `env[k]?.trim() !== undefined`
  - *How:* `0`
  - *How:* `false`
  - *How:* `off`

<!-- learned-stamp: category=convention; capturedAt=2026-09-26T13:29:54.550Z; skill=chimera; applied=2; wins=2; skipped=16; skippedWins=16 -->
- **When a test diff adds a `toContain`/`equals` assertion on a literal string built in another module (e.g. model-facing tool feedback assembled in `packages/core/src/execution/tool-executor-results.ts`), grep the producing source for that exact literal before accepting it — assert-only-if-exists, because a paraphrased literal yields a deterministically red test that also silently stops guarding the invariant it names. When a diff introduces a security-isolation constant (env map or leading CLI args), verify the consumption site merges it non-mutating (`{ ...base, ...isolated }` before `spawn`) and that the prefix lands before the subcommand at every adapter call, not just the one hunk shown; a frozen object passed to a mutable `Record` param is safe only because it is spread.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `toContain`
  - *How:* `equals`
  - *How:* `packages/core/src/execution/tool-executor-results.ts`
  - *How:* `{ ...base, ...isolated }`
  - *How:* `spawn`
  - *How:* `Record`

<!-- learned-stamp: category=convention; capturedAt=2026-09-26T12:08:57.594Z; skill=bug-hunter; applied=8; wins=8; skipped=33; skippedWins=33 -->
- **When a test diff flips a default assertion (e.g. `cascadeOn` `off`→`high`, or `enabled` default-on) in `packages/core/tests/**`, validate it against the resolver's actual operator, not the declaration: `cfg.x ?? DEFAULT` means an explicit falsy-or-`'off'` value must still be asserted separately from the no-key case, so confirm both branches are pinned. For `enabled: cfg.enabled !== false` style master switches in `packages/core/src/plugins/*-config.ts`, the "regression used to be `=== true`" comment is a historical claim — check current source before treating it as a live defect.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `cascadeOn`
  - *How:* `off`
  - *How:* `high`
  - *How:* `enabled`
  - *How:* `packages/core/tests/**`
  - *How:* `cfg.x ?? DEFAULT`
  - *How:* `'off'`
  - *How:* `enabled: cfg.enabled !== false`
  - *How:* `packages/core/src/plugins/*-config.ts`
  - *How:* `=== true`

<!-- learned-stamp: category=convention; capturedAt=2026-09-26T11:50:28.423Z; skill=chimera; applied=13; wins=13; skipped=33; skippedWins=33 -->
- **When a WebUI/config seed flips an `enabled` default (e.g. `meta['chimeraEnabled']` / `meta['autoReviewEnabled']` in `packages/webui-server/src/server/context-meta.ts`), validate it against the host enablement layer rather than the plugin's internal resolver: read `defaultState` for that plugin name in `HOST_PLUGIN_AUDIT_ENTRIES` (`packages/plugins/src/plugin-audit-catalog/index.ts`) and `resolvePluginEnablement`. `!== false` is only correct when the catalog says `defaultState: 'active'`; a comment claiming `inactive` may itself be stale, so confirm on disk before calling the flip a regression. Also check the *consumption site* of a changed `DEFAULT_*` constant, not just its declaration — for these plugins the auto-review default's source of truth is `packages/core/src/plugins/auto-review-config.ts`, while `auto-review-plugin.ts` carries only help text, so a diff touching only one file can look stale while being correct. ```json { "findings": [] } ```**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `enabled`
  - *How:* `meta['chimeraEnabled']`
  - *How:* `meta['autoReviewEnabled']`
  - *How:* `packages/webui-server/src/server/context-meta.ts`
  - *How:* `defaultState`
  - *How:* `HOST_PLUGIN_AUDIT_ENTRIES`
  - *How:* `packages/plugins/src/plugin-audit-catalog/index.ts`
  - *How:* `resolvePluginEnablement`
  - *How:* `!== false`
  - *How:* `defaultState: 'active'`
  - *How:* `inactive`
  - *How:* `DEFAULT_*`
  - *How:* `packages/core/src/plugins/auto-review-config.ts`
  - *How:* `auto-review-plugin.ts`
  - *How:* `json { "findings": [] }`

---
*Last capture: 2026-09-26T14:26:21.189Z · 10 entries*
