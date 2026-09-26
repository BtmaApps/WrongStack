## Review basis
- Resolve findings against live `read`/`grep`, citing current lines; re-read after `file.external.edit`.

## Plugin enablement defaults
- When a seed flips an `enabled` default (`meta['chimeraEnabled']` / `meta['autoReviewEnabled']` in `packages/webui-server/src/server/context-meta.ts`), validate against the host layer, not the plugin resolver: `defaultState` in `HOST_PLUGIN_AUDIT_ENTRIES` (`packages/plugins/src/plugin-audit-catalog/index.ts`) via `resolvePluginEnablement`. `!== false` holds only when the catalog says `defaultState: 'active'`; an `inactive` comment may be stale — confirm on disk. For changed `DEFAULT_*` constants, check consumption: auto-review's truth is `packages/core/src/plugins/auto-review-config.ts`; `auto-review-plugin.ts` has only help text, so a one-file diff can look stale yet be correct.

## TUI (`packages/tui/src/**`)
- When a diff can newly empty an array (zero-result filters in `packages/tui/src/components/theme-picker.tsx`), trace every `options[clamped]` lookup and Enter/confirm consumer; require guards like `selectedOption?.id ?? activeId` and treat reducer `selected` plus confirmation as one contract.
- Validate caller-derived React keys (`h:${row.family}`) against the prop contract; if types don't guarantee uniqueness, require safe keying.

## Literals and wiring
- Before accepting a test's `toContain`/`equals` on a literal assembled elsewhere (e.g. `packages/core/src/execution/tool-executor-results.ts`), grep the producer for the exact literal; a paraphrase yields a red test guarding nothing.
- For security-isolation constants (env map, leading CLI args), verify every adapter call site merges non-mutating (`{ ...base, ...isolated }` before `spawn`) with the prefix before the subcommand — not just the shown hunk.
- A defaulted option added to a module-private function reached via an injectable `dep = realFn` default is dead wiring unless the injected call site passes it — read that site, not the parameter line.

## Types and protocol catalogs
- When a field becomes `import('./x.js').T`, remove stale `import type { T }`; `noUnusedLocals: true` in `tsconfig.base.json` yields `TS6133`.
- New exported constant under `packages/core/src/types/**`: grep `packages/core/src/types/index.ts` — the barrel enumerates values, so an omission resolves `undefined` and dead-codes `@wrongstack/core` comparisons.
- New `SERVER_EXTENSION_MESSAGE_TYPES` entry: run `packages/webui-protocol/tests/message-catalogs.test.ts`. Before flagging producer-less entries dead, grep the type repo-wide; a declaration in `packages/webui/src/types/server-message-system.ts` plus dispatch in `packages/webui/src/hooks/ws-handlers/*.ts` is a forward contract.

## SimpleUI preference toggles
- Close the contract in one pass: field/default/`parsePrefs` in `packages/simpleui/src/lib/prefs-model.ts`; the key in `shallowEqualPrefs` (`packages/simpleui/src/hooks/use-settings.ts`, else `isAtDefaults` stays stale); catalog id in `packages/simpleui/src/lib/settings-catalog.ts`; `ToggleRow` `settingId`/`hidden` in `packages/simpleui/src/settings-panel.tsx`; the key in `BOOLEAN_PREF_KEYS` (`packages/webui-server/src/server/ws-payload-preferences.ts`) — unlisted `prefs.update` keys are server-rejected, so client-only additions never persist.

## Scanners and docs
- In chunked scanning (`EVIDENCE_MATCH_WINDOW`, `packages/plugins/src/evidence-analyzer/index.ts`), test matches crossing chunk boundaries: 1-char overlap with index-0 skip drops seam-spanning matches — deterministic evasion at `k*WINDOW-1`. Require overlap ≥ max match length or absolute-start dedup.
- Validate `observeJevClient`/Jev-record claims against `packages/core/src/typesafe/activity.ts` (`ObserveJevClientOptions`, `tailEntry`, `[redacted]`/`[truncated:…]`, `CONTENT_MAX_CHARS`, `LOG_DIR_ENV`) in the same pass. For `logContentWanted` (`packages/core/src/typesafe/resolve.ts`), file empty-string divergence only when a real off-spelling (`0`, `false`, `off`) misbehaves.
