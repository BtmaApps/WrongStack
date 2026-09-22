## Commands

- Type-check the touched package after touching i18n strings: `pnpm --filter @keep-operating/webui exec tsc --noEmit` (or the repo's standard `pnpm typecheck`) before reporting the catalog task done. Untyped `t` props fail the catalog-integrity gate; the typecheck surfaces it.

## Conventions

- **Side-panel keys are flat.** In `packages/webui`, every `sidePanel.*` description must be a top-level key whose name is *exactly* one of the members of the `Activity` union in `packages/webui/src/stores/ui-store-types.ts` (`'chat' | 'agents' | 'files' | 'changes' | 'mailbox' | 'skills' | 'design'`). `SidePanel/index.tsx` builds the lookup string as `` t(`activity:sidePanel.${activeActivity}`) ``, so:
  - No `desc.*` nesting, no plural suffixes, no case changes.
  - Adding a new `Activity` member requires a matching flat `sidePanel.<member>` key in every catalog that ships the `activity` namespace — `en-US`, `zh-CN`, and any other locale present.
- **Type the translator prop.** When a component receives `t`, declare it as `(key: string, opts?: Record<string, unknown>) => string` (or import the package's `TFunction` type). Bare `t: any` or untyped destructured `t` — as in `packages/webui/src/components/KanbanTaskExecution.tsx` — fails the catalog-integrity "no t() without translator" gate, which matches on `t: (`.
- **Build profile before bundle shape.** Before assuming what a TS package's `main`/`types`/`bin` (`./dist/<name>.js`) actually emit, read the per-package profile block inside `scripts/build-package.mjs`. The profile is authoritative over any guess from the `package.json` `main` field.

## Pitfalls

- Don't reuse a `sidePanel.*` key across multiple `Activity` values expecting contextual disambiguation — the key is the activity id, one-to-one.
- Don't "fix" an untyped `t` by casting inline at the call site (`(t as any)(...)`); the gate inspects the *prop declaration*. Fix the prop type.
- Don't infer build outputs from neighboring packages — each TS package has its own profile block in `scripts/build-package.mjs`, and the shapes drift.
