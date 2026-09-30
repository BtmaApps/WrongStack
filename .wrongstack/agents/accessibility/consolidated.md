## Modals
- Prefer `packages/webui/src/components/ui/dialog.tsx` or `packages/webui/src/components/ui/sheet.tsx` for modal UI in `packages/webui`; a visual overlay plus `aria-modal` alone is not accessible — modals must provide focus entry, containment, and restoration.

## Contrast Testing
- Measure palette-wide contrast and luminance through a MEASURE-gated printer test run with `npx vitest` in `packages/tui`, never plain Node `.mjs`; `packages/tui/src/theme-presets/options.ts` value-imports `@wrongstack/core/types`, which only resolves via the aliases in `packages/tui/vitest.config.ts`.