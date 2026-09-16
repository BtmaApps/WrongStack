<!-- verified: 2026-09-16 | live check against MDN, web.dev Baseline, caniuse -->
<!-- One row below is explicitly marked UNVERIFIED. Do not assert it without checking. -->

# HTML & platform APIs baseline

Re-verify anything below if `verified:` is more than 90 days old.

## Overlays

| Feature | Tier | Replaces |
|---|---|---|
| **`<dialog>` + `showModal()`** | Widely available | Custom modal with a hand-rolled focus trap, scroll lock, and `Escape` handler |
| **Popover API** (`popover`, `popovertarget`) | **Newly available** (Baseline Jan 2025; reaches *widely available* ~Jul 2027) | JS-managed dropdown/tooltip open state and light-dismiss — pair with a fallback for older targets |
| `::backdrop` | Widely available | A manually rendered overlay div |
| **Anchor positioning** | **Baseline since Jan 2026** (see `css.md`) | Popper / Floating UI for placement and flipping |

`<dialog>` gives focus management, inertness of the background, `Escape` to
close, and `::backdrop` for free. Reaching for a modal library is now the
exception that needs justifying.

## Forms

| Feature | Tier | Notes |
|---|---|---|
| Constraint validation (`required`, `pattern`, `:user-invalid`) | Widely available | Prefer `:user-invalid` over `:invalid` — it waits until the user has interacted |
| `<input type="date|time|color|range">` | Widely available | Check the design impact; native pickers vary by platform |
| `<datalist>` | Widely available | Simple autocomplete without a library |
| **`field-sizing: content`** | **Baseline since Jun 2026** | Auto-growing textarea without JS measurement |
| **Customizable select** (`appearance: base-select`, `::picker(select)`) | **Limited** — Chrome/Edge 135+; Safari shipping/TP around 27; Firefox behind a flag in Nightly | Purely additive: an unsupporting browser renders a normal native select |
| `inputmode`, `enterkeyhint`, `autocomplete` | Widely available | Mobile keyboard correctness — cheap, routinely forgotten |

Always set `autocomplete` on real fields (name, email, address, one-time-code).
It is an accessibility and conversion win, and it is free.

## Media & loading

| Feature | Tier | Notes |
|---|---|---|
| `loading="lazy"` | Widely available | Below-the-fold images |
| `fetchpriority` | Widely available | Raise the LCP image, lower the rest |
| `<picture>` / `srcset` / `sizes` | Widely available | Serve the right bytes per viewport |
| `decoding="async"` | Widely available | Avoid decode jank |
| Explicit `width`/`height` or `aspect-ratio` | — | **Mandatory** — the main source of layout shift |
| AVIF / WebP | Widely available | With a fallback source |

## Structure & semantics

| Feature | Tier | Notes |
|---|---|---|
| Landmarks (`header/nav/main/aside/footer`) | Widely available | One `main`, one `h1` |
| `<details>` / `<summary>` | Widely available | A real disclosure widget in the a11y tree, keyboard-operable, zero JS |
| `<details name="…">` (exclusive accordion) | Newly available | Accordion without JS |
| `inert` | Widely available | Disable a background region wholesale |
| **Declarative Shadow DOM** | **Widely available** — Chrome/Edge 111+, Firefox 123+, Safari 16.4+ | SSR-able components with no client JS for first render |
| `<template>` + Web Components | Widely available | Only when framework-independence is a requirement |

## Platform APIs commonly hand-rolled

| API | Tier | Replaces |
|---|---|---|
| `IntersectionObserver` | Widely available | Scroll listeners for visibility |
| `ResizeObserver` | Widely available | Window resize handlers (but prefer container queries in CSS) |
| `AbortController` / `AbortSignal` | Widely available | Manual cancellation flags |
| `structuredClone` | Widely available | `JSON.parse(JSON.stringify(x))` |
| `Intl.*` (`NumberFormat`, `DateTimeFormat`, `RelativeTimeFormat`, `ListFormat`) | Widely available | Hand-written date/number/list formatting — **always** use `Intl` |
| `navigator.clipboard` | Widely available | `document.execCommand('copy')` |
| View Transition API | Newly available | Hand-built FLIP transitions |
| Speculation Rules (prerender/prefetch) | **UNVERIFIED** — last live check could not confirm a tier | Do not assert support for this one; check before recommending it |

## Reminders that keep costing time

- Every `<img>` needs dimensions or `aspect-ratio`.
- Every icon-only control needs an accessible name (`aria-label`), and an emoji
  is not a name.
- A `<div onClick>` is not a button — it loses keyboard, focus, and role.
- `tabindex` values above 0 are always a bug.
- Use `Intl` before writing any formatting string by hand.
