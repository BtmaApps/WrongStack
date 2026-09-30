## Modals in `packages/webui`
- Prefer `packages/webui/src/components/ui/dialog.tsx` or `packages/webui/src/components/ui/sheet.tsx` for modal UI; do not ship a visual overlay plus `aria-modal` alone.
- Do not treat `aria-modal` as accessible unless the modal also provides focus entry, containment, and restoration.

## TUI theme preview budget
- Give any new `sections` entry in `packages/tui/src/components/theme-preview.tsx` a `cost` of 1 unless you re-prove `contentBudget = maxRows − 3`: existing `sections` sum to 15 and `packages/tui/tests/theme-picker.test.tsx` caps the `maxRows: 20` frame at 19 lines, leaving one row of headroom.
- Do not use cost 2 or higher without re-proving: cost 2 fails that test, cost ≥3 hides the section below `maxRows` 21.
- Guard single-row rendering with `wrap="truncate-end"`.

## Contrast measurement
- Measure palette-wide contrast/luminance through a MEASURE-gated printer test run under `npx vitest` in `packages/tui`, never a plain Node `.mjs`.
- Do not bypass `packages/tui/vitest.config.ts`: `packages/tui/src/theme-presets/options.ts` value-imports `@wrongstack/core/types`, which only resolves via those aliases.
