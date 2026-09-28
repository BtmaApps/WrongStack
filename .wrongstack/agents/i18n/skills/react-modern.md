## Workflow

- Run the catalog-integrity baseline first and read its missing-list before writing any flatten-and-compare script. For pure-addition `en` changes, use the exact missing-key set per locale; skip placeholder and `en`-identical checks until non-English parity is restored.
- Re-read target lines immediately before reporting an active-fleet audit, and report the state from that final read—not an earlier diff, since another agent may have changed the working tree.

## Catalog and component conventions

- In `packages/webui`, never compose counts as `{n} {t('ns:key')}`. Use `t(key, { count })` with `_one`/`_other`; only parenthesized counts are safe with the flat-key fallback.
- Keep `sidePanel.*` keys flat in every catalog. In `packages/webui`, each key must be exactly `sidePanel.<Activity>` for a member of the `Activity` union in `packages/webui/src/stores/ui-store-types.ts`; do not nest under `desc`, add plural suffixes, or change case. Add keys for new members to `en-US`, `zh-CN`, and every other shipped locale.
- When refs dangle, compare the missing refs with keys the catalog actually added before renaming. Treat drift such as `manual` versus `manualCommandNeeded` as additive unless evidence requires otherwise.
- Never printf-escape literal percent signs in i18next catalogs: `%%` renders literally. Scan non-English interpolations for doubled percent signs such as `%%%{{pct}}`; use the repository idiom `(%{{pct}})` for `ctxBreakdown.cacheCoverageOf`.

## Types and builds

- After changing strings, run `pnpm --filter @keep-operating/webui exec tsc --noEmit` (or the repository’s `pnpm typecheck`). Type received translators as `(key: string, opts?: Record<string, unknown>) => string` or `TFunction`; fix the prop declaration rather than adding an inline `(t as any)` cast, because the gate matches `t: (`.
- Read the package profile block in `scripts/build-package.mjs` before inferring `main`, `types`, or `bin`; it, not `package.json` or neighboring packages, defines the emitted `./dist/<name>.js` shapes.
