<!-- verified: 2026-09-16 | sources: MDN, web.dev Baseline, caniuse -->

# HTML & platform APIs baseline

Re-verify anything below if `verified:` is more than 90 days old.

## Overlays

| Feature | Tier | Replaces |
|---|---|---|
| **`<dialog>` + `showModal()`** | Widely available | Custom modal with a hand-rolled focus trap, scroll lock, and `Escape` handler |
| **Popover API** (`popover`, `popovertarget`) | Widely available | JS-managed dropdown/tooltip open state and light-dismiss |
| `::backdrop` | Widely available | A manually rendered overlay div |
| Anchor positioning | Limited (Chromium first) | Collision libraries — enhance only, keep a static fallback position |

`<dialog>` gives focus management, inertness of the background, `Escape` to
close, and `::backdrop` for free. Reaching for a modal library is now the
exception that needs justifying.

## Forms

| Feature | Tier | Notes |
|---|---|---|
| Constraint validation (`required`, `pattern`, `:user-invalid`) | Widely available | Prefer `:user-invalid` over `:invalid` — it waits until the user has interacted |
| `<input type="date|time|color|range">` | Widely available | Check the design impact; native pickers vary by platform |
| `<datalist>` | Widely available | Simple autocomplete without a library |
| `field-sizing: content` | Newly available | Auto-growing textarea without JS measurement |
| `<selectlist>` / customizable select | Limited | Enhance only; custom select remains the fallback |
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
| `<details>` / `<summary>`, `name` for exclusive accordion | Widely available (`name`: newly) | Accordion without JS |
| `inert` | Widely available | Disable a background region wholesale |
| `<template>` + Web Components | Widely available | Only when framework-independence is a requirement |
| Declarative Shadow DOM | Newly available | SSR-able components |

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
| Speculation Rules (prerender/prefetch) | Limited (Chromium) | Enhance only |

## Reminders that keep costing time

- Every `<img>` needs dimensions or `aspect-ratio`.
- Every icon-only control needs an accessible name (`aria-label`), and an emoji
  is not a name.
- A `<div onClick>` is not a button — it loses keyboard, focus, and role.
- `tabindex` values above 0 are always a bug.
- Use `Intl` before writing any formatting string by hand.
