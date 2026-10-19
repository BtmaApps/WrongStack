# Learned instructions for `reviewer`

> Project-specific learning data for the `reviewer` agent. Each entry is a directive — read it as an instruction, not a journal entry. Entries are re-derived on every capture, so this file is always a current, structured snapshot of what this agent has learned.

## What to do

<!-- learned-stamp: category=convention; capturedAt=2026-10-18T00:39:49.024Z; applied=5; wins=5; skipped=20; skippedWins=20 -->
- **Always resolve a CSS `@import` added to `packages/vibeui/src/app/globals.css` against the file on disk and cross-check every referenced custom property against its definitions — in this repo, type/corner tokens live in `packages/vibeui/src/app/design-tokens.css` (`:root`), while color/surface tokens stay theme-scoped in globals.css. An undefined custom property makes `font-size`/`border-radius` invalid at computed-value time (falls back to inherited/initial), silently breaking layout instead of failing the build. Also resolve citations against the live file, not the diff snapshot: externally edited files (`file.external.edit`) may already contain follow-up refinements past the handed-off diff. ```json { "findings": [] } ```**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `@import`
  - *How:* `packages/vibeui/src/app/globals.css`
  - *How:* `packages/vibeui/src/app/design-tokens.css`
  - *How:* `:root`
  - *How:* `font-size`
  - *How:* `border-radius`
  - *How:* `file.external.edit`
  - *How:* `json { "findings": [] }`

<!-- learned-stamp: category=convention; capturedAt=2026-10-18T06:26:37.516Z; skill=chimera; applied=2; wins=2; skipped=17; skippedWins=17 -->
- **Always resolve Chimera citations against the file on disk before flagging — this session's handed-off diff omitted the `escapeClosesPanels(event)` wiring present at `packages/vibeui/src/components/workspace.tsx:150`, and reviewing the diff alone would have produced a false Critical/High "unused import breaks the new test" finding. ```json { "findings": [] } ```**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `escapeClosesPanels(event)`
  - *How:* `packages/vibeui/src/components/workspace.tsx:150`
  - *How:* `json { "findings": [] }`
  - *How:* `packages/vibeui/src/components/workspace.tsx`

<!-- learned-stamp: category=convention; capturedAt=2026-10-18T07:04:26.355Z; skill=chimera; applied=1; wins=1; skipped=14; skippedWins=14 -->
- **Always resolve Tailwind-utility-to-CSS-class refactors against the component layer on disk — a modifier class like `.site-section--short` that only redefines a custom property is silently inert if the diff ever applies it without its base `.site-section`, so verify both that the classes exist and that each modifier is paired on the same element. When `grep` reports `count=N` but renders only ~3 match groups, re-read the file with explicit `offset`/`limit` windows before concluding coverage.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `.site-section--short`
  - *How:* `.site-section`
  - *How:* `grep`
  - *How:* `count=N`
  - *How:* `offset`
  - *How:* `limit`

<!-- learned-stamp: category=convention; capturedAt=2026-10-18T09:52:41.159Z; skill=chimera; skipped=8; skippedWins=8 -->
- **When a session deletes container styling (e.g. `.source-preview` losing `overflow`/`max-height`) and rewires the element to a shared viewer component, resolve the replacement containment in the target stylesheet — here `.code-panel pre` at `packages/vibeui/src/app/globals.css` provides `max-height`/`overflow`, so the deletion is not a regression; cite the providing rule before flagging.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `.source-preview`
  - *How:* `overflow`
  - *How:* `max-height`
  - *How:* `.code-panel pre`
  - *How:* `packages/vibeui/src/app/globals.css`

<!-- learned-stamp: category=convention; capturedAt=2026-10-19T08:51:39.419Z; skipped=2; skippedWins=2 -->
- **When converting a one-shot draw-once SVG stroke animation (`forwards` fill, base `stroke-dashoffset` hiding the stroke) into an infinite staggered loop, re-hide strokes during `animation-delay` with `animation-fill-mode: backwards` rather than deleting the base `stroke-dashoffset` rule — with default fill-mode `none`, delayed strokes compute at dashoffset 0 and flash fully drawn before each redraw, and any scroll-away/tab-hide state machine that cancels and restarts the animation makes the flash recur on every re-entry. Anchor this check in `website/src/index.css` `.oxog-mark` rules and `website/src/components/site/OxogBrand.tsx` `OxogMark`.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `forwards`
  - *How:* `stroke-dashoffset`
  - *How:* `animation-delay`
  - *How:* `animation-fill-mode: backwards`
  - *How:* `none`
  - *How:* `website/src/index.css`
  - *How:* `.oxog-mark`
  - *How:* `website/src/components/site/OxogBrand.tsx`
  - *How:* `OxogMark`

---
*Last capture: 2026-10-19T08:51:39.419Z · 5 entries*
