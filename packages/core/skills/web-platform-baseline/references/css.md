<!-- verified: 2026-09-16 | live check against MDN, web.dev Baseline, caniuse -->
<!-- Previous revision was dated but NEVER verified: 7 of 14 tiers below were wrong. -->

# CSS baseline

Availability is stated as a **Baseline tier**, not a version table:

- **Widely available** — in all major engines for 30+ months. Use without a
  fallback for evergreen targets.
- **Newly available** — in all major engines, recently. Use with a fallback or
  behind `@supports` if the audience includes slow-updating browsers.
- **Limited** — not yet in every engine. Progressive enhancement only.

Re-verify anything below if `verified:` is more than 90 days old, per the
staleness rule in SKILL.md. **A date is only worth what the check behind it was**
— the first revision of this file carried today's date without any live check
and was wrong about half its rows.

---

## Layout

| Feature | Tier | Use it instead of |
|---|---|---|
| Flexbox, Grid | Widely available | Float/table layouts |
| `gap` in flexbox | Widely available | Margin hacks between children |
| **Container queries** (`@container`, `cqi` units) | Widely available (Baseline since Feb 2023) | JS resize observers; component styles keyed to viewport |
| **`:has()`** | Widely available (Baseline since Dec 2023) | JS class toggling on a parent when a child changes |
| **Subgrid** | Widely available (Baseline since Sep 2023) | Nested grid alignment hacks; fixed heights to line up cards |
| `aspect-ratio` | Widely available | Padding-top percentage hack |
| Logical properties (`margin-inline`, `padding-block`) | Widely available | Physical properties in RTL-capable UI |
| `min()` / `max()` / `clamp()` | Widely available | Breakpoint ladders for fluid type and gutters |
| Cascade layers (`@layer`) | Widely available | Specificity wars, `!important` |
| Native nesting | Widely available | SASS used only for nesting |
| **Anchor positioning** (`anchor()`, `position-anchor`, `@position-try`) | **Baseline since Jan 2026** — Chrome/Edge 125+, Firefox 132+, Safari 18.2+ (`@position-try` needs Safari 18.4+) | JS collision-detection libraries (Popper, Floating UI) for tooltips and popovers |

## Color

| Feature | Tier | Notes |
|---|---|---|
| Custom properties | Widely available | The token substrate; all kits rely on it |
| **OKLCH / `oklch()`** | Widely available | Perceptually even ramps; what the kits materialize |
| **`color-mix()`** | Widely available | Derive hover/pressed/subtle variants from one token |
| Relative color syntax (`from`) | Newly available | Prefer `color-mix()` where both work |
| `light-dark()` | Newly available (Baseline widely available expected Nov 2026) | One declaration for both themes; still ship the token set |
| Wide-gamut (`display-p3`) | Widely available | Only with an sRGB fallback |

## Typography

| Feature | Tier | Use it instead of |
|---|---|---|
| Variable fonts | Widely available | Shipping 6 static weights |
| **`text-wrap: balance`** | Widely available | Manual `<br>` in headings |
| **`text-wrap: pretty`** | **Limited** — Chrome/Edge 130+, Safari 17.5+ (refined in 26); **not in Firefox** | Leaving orphans in body copy — but treat as enhancement, not a guarantee |
| `font-variant-numeric: tabular-nums` | Widely available | Misaligned numeric columns |
| `size-adjust` / `ascent-override` in `@font-face` | Widely available | Layout shift on webfont swap |
| **`text-box-trim` / `text-box-edge`** | **Baseline since Aug 2026** | Manual negative margins to sit text on the grid |
| `hanging-punctuation` | Limited (Safari) | Purely optical; safe to enhance |

## Motion & interaction

| Feature | Tier | Notes |
|---|---|---|
| `prefers-reduced-motion` | Widely available | **Mandatory**, not optional |
| `@starting-style` | Newly available (Baseline since Aug 2024; ~91% global) | Entry animation for elements appearing from `display:none` |
| `transition-behavior: allow-discrete` | Newly available (same Baseline date) | Animating to/from `display:none` without JS |
| **Scroll-driven animations** (`animation-timeline`) | **Limited — NOT Baseline.** Chrome/Edge 115+, Safari 26+; **Firefox still behind `layout.css.scroll-driven-animations.enabled` as of FF 152 (Jun 2026)**. ~82% global | Enhance only, behind `@supports`. Failure mode is "no animation", not a broken page |
| View Transitions (same-document) | Newly available | Hand-built FLIP animations |
| View Transitions (cross-document, `@view-transition { navigation: auto }`) | Newly available — in production use in 2026 | Same-origin page-to-page transitions |
| `scroll-behavior: smooth` | Widely available | JS smooth-scroll libraries |
| Scroll snap | Widely available | JS carousel positioning |

## Visual

| Feature | Tier | Notes |
|---|---|---|
| `backdrop-filter` | Widely available | Only when the kit sanctions glass |
| `mask-image` | Widely available | PNG masks |
| `content-visibility` | Widely available | Long-list render cost |
| `@supports` | Widely available | The correct gate for every "Limited" row above |

## Patterns worth keeping

**Fluid type without breakpoints**
```css
h1 { font-size: clamp(2rem, 1.2rem + 3vw, 3.5rem); }
```

**Component-level responsiveness**
```css
.card-host { container-type: inline-size; }
@container (min-width: 28rem) { .card { grid-template-columns: 12rem 1fr; } }
```

**Derived state colors from one token**
```css
.btn:hover { background: color-mix(in oklch, var(--color-primary) 88%, black); }
```

**Parent styling from child state**
```css
.field:has(input:invalid) { border-color: var(--color-danger); }
```

**Enhancement gate** — required for every "Limited" row
```css
@supports (animation-timeline: scroll()) { /* … */ }
```
