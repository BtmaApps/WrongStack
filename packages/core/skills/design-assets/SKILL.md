---
name: design-assets
description: "Prepare icons, SVGs, images, fonts and illustrations for product use with correct rights, formats and rendering. Use when importing, optimizing or generating design assets; preserve an established icon system rather than inventing incompatible replacements."
trigger: "Prepare icons, SVGs, images, fonts and illustrations for product use with correct rights, formats and rendering. Use when importing, optimizing or generating design assets; preserve an established icon system rather than inventing incompatible replacements."
version: 1.1.1
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

Product design assets—icons, inline and sprite SVGs, responsive raster images (AVIF/WebP/PNG), web fonts, and custom illustrations—directly shape visual sharpness, layout stability (CLS), theme adaptability, and licensing compliance. Disciplined asset engineering keeps vector geometry clean, aligns icon stroke weights and optical grids across the entire surface, and sizes every image and font subset to its real rendered footprint.

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

- [ ] Asset license/provenance recorded and no fabricated third-party logos or unverified stock claims used
- [ ] Every `<img>` declares intrinsic `width`/`height` (or `aspect-ratio`) with responsive `srcset`/`sizes` where appropriate
- [ ] SVGs include a valid `viewBox`, apply `currentColor` for monochrome theming, and omit inline scripts or colliding IDs
- [ ] Decorative icons carry `aria-hidden="true"` while semantic/interactive icons provide an accessible name
- [ ] Web fonts subsetted to used weights/scripts with metric-compatible fallbacks and rendered in both light/dark themes

## Sources

Versioned facts checked 2026-10-23; refresh authoritative sources before new installs/upgrades.
[SVG](https://developer.mozilla.org/en-US/docs/Web/SVG), [Responsive images](https://developer.mozilla.org/en-US/docs/Learn_web_development/HTML/Multimedia_and_embedding/Responsive_images).

## Skills in scope

- design-system — aligning icon grids, stroke tokens, font stacks, and theme-adaptive color tokens.
- design-craft — integrating photography, illustration, and typography into a cohesive visual hierarchy.
- accessibility — alt-text authoring, icon-button accessible names, and contrast across image overlays.
- web-performance — LCP hero image prioritization, AVIF/WebP byte budgets, and zero-CLS font/image loading.
