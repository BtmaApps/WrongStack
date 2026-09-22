## Conventions

- WebUI `sidePanel.*` description keys must match the `Activity` union (`'chat'|'agents'|'files'|'changes'|'mailbox'|'skills'|'design'`) defined in `packages/webui/src/stores/ui-store-types.ts`. The key is composed dynamically as `` t(`activity:sidePanel.${activeActivity}`) `` in `packages/webui/src/components/SidePanel/index.tsx` — use flat key names, no `desc.*` nesting.
- Newest strings block in `packages/webui/src/i18n/locales/*/settings.json` is `settings:jev.*` (Jev decision-tool feature). Treat it as a likely site of partial translations.

## Patterns

- When a TS package's `package.json` `main`/`types`/`bin` all point at `./dist/<name>.js` and the build script delegates to `scripts/build-package.mjs`, always read that build profile before assuming the bundle shape.
- Type a passed-in translator prop as `(key: string, opts?: Record<string, unknown>) => string` so catalog-integrity's `t: (` heuristic recognizes it. Untyped signatures (`t: any`, bare destructured `t`) trip the "no `t()` without translator" gate — reference example: `packages/webui/src/components/KanbanTaskExecution.tsx`.

## Warnings

- `pnpm -C packages/webui exec vitest run tests/i18n/catalog-integrity.test.ts` only checks key parity, empty strings, dangling `t()` refs, and translator wiring. It does **not** cover:
  - placeholder `{{...}}` parity across locales
  - plural-suffix hygiene (`_one` / `_other` etc.)
  - untranslated strings whose value is byte-identical to the English source
  Audit these with a throwaway flatten-and-compare script written under `.temp_files/`.
- New-feature strings often land translated in only a subset of locales while key parity still passes. When auditing WebUI catalogs, compare value-identity-to-en per locale, not just key presence.