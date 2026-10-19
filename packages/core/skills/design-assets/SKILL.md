---
name: design-assets
description: "Prepare icons, SVGs, images, fonts and illustrations for product use with correct rights, formats and rendering. Use when importing, optimizing or generating design assets; preserve an established icon system rather than inventing incompatible replacements."
trigger: "Prepare icons, SVGs, images, fonts and illustrations for product use with correct rights, formats and rendering. Use when importing, optimizing or generating design assets; preserve an established icon system rather than inventing incompatible replacements."
version: 1.1.0
required-capabilities: [filesystem.read]
required-tools: []
optional-capabilities: [filesystem.write, execution.shell, verification.run, web.research]
metadata:
  routing-group: design
  domain: "design"
---

# Design Assets

## Selection card
- Task: Create consistent icons and exportable visual assets.
- Start: Identify the target surface, reference, user task and existing tokens.
- Finish: apply the acceptance checks below; report observed results and unresolved constraints.

## Overview

Prepare icons, SVGs, images, fonts and illustrations for product use with correct rights, formats and rendering.

Choose current supported codecs and asset tools after inspecting the project and target platforms; verify generated/imported assets rather than assuming their suitability.

## Rules

1. Record provenance/license, intended semantic role, display size and supported backgrounds.
2. Preserve vectors for icons/diagrams where practical; use raster assets for photographic or bitmap content.
3. Check SVG viewBox, dimensions, currentColor behavior and external references before embedding.
4. Optimize against measured output size and visible quality; keep editable masters separate from delivery assets.
5. Treat fonts as layout dependencies: license, subsets, weights, language coverage and fallback all affect output.
6. Label generated/demo imagery honestly; do not fabricate customer logos or product evidence.

## Workflow

1. Inventory the existing asset pipeline and naming conventions.
2. Inspect the actual source asset; choose formats/crops/variants from delivery needs.
3. Integrate semantic icons or images with appropriate accessible treatment.
4. Render in supported themes, at small/large sizes and with fallback fonts.
5. Verify dimensions, loading behavior and ownership of source/delivery files.

## Measurable acceptance

| Asset | Check | How |
|---|---|---|
| Images | Every `<img>` has `width`/`height` (or an `aspect-ratio`) so loading does not shift the layout; `srcset`/`sizes` deliver at most ~2× the rendered size; below-the-fold images lazy-load | `inspect` rules `media.unsized-image`, `media.broken-image`; compare natural vs rendered size in the browser |
| Formats | Modern formats (AVIF/WebP) with a fallback only where the support matrix requires it | Check web-platform-baseline before claiming support |
| Icons | One icon family, one stroke width and one grid size per product; icon-only controls have an accessible name; decorative icons are `aria-hidden` | Grep the icon imports; inspect accessible names with browser_snapshot |
| SVG | `viewBox` present, no fixed `width`/`height` unless intended, `currentColor` for single-color icons, no external references or scripts | Open the file; render at 16px and 48px in both themes |
| Fonts | At most 2–3 text families (`inspect` `type.family-count`); only the weights in use are loaded; a fallback stack with similar metrics; `font-display` chosen deliberately | Network panel: loaded font files vs weights used |
| Rights | Licence and provenance recorded per asset; generated or stock imagery labelled as such; no third-party logos as social proof | Asset manifest or `.design/brief.md` |

When imagery comes from a reference site (design-reference-read), its screenshots
are evidence for measurement only; never ship them or the brand's illustrations.

## Before returning

Rights/provenance recorded; actual assets inspected; theme/size/language variants checked; editable master preserved when required.

## Sources

Versioned facts checked 2026-10-09; refresh authoritative sources before new installs/upgrades.
[SVG](https://developer.mozilla.org/en-US/docs/Web/SVG), [Responsive images](https://developer.mozilla.org/en-US/docs/Learn_web_development/HTML/Multimedia_and_embedding/Responsive_images).

## Skills in scope

- design-system — tokens and shared component state.
- design-craft — product-specific composition.
- accessibility — keyboard and assistive interaction.
- web-performance — loading and frame measurements.
