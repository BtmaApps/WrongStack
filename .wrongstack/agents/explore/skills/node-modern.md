## Plugin `defaultState`

- When changing a plugin's `defaultState`, edit only `packages/plugins/src/plugin-audit-catalog/index.ts` — the single catalog source. Never infer host-plugin defaults from the generated `packages/plugins/src/audit/index.ts`: it covers only published `@wrongstack/plugins` entries, zero `wstack-*` host plugins.
- Update `website/src/data/runtime-catalog.ts` in the same pass; it hand-duplicates `defaultState` and drifts silently. Verify by grepping repo-wide for the plugin name — not the catalog module path — and reconcile every `defaultState` occurrence.
