---
name: i18n-localization
description: "Implement localization with translated messages, locale-aware formatting and adaptable layouts. Use when supporting multiple languages, RTL or regional formats; preserve message identity and test realistic translated content rather than only replacing labels."
trigger: "Implement localization with translated messages, locale-aware formatting and adaptable layouts. Use when supporting multiple languages, RTL or regional formats; preserve message identity and test realistic translated content rather than only replacing labels."
version: 1.0.2
required-capabilities: [filesystem.read]
required-tools: []
optional-capabilities: [filesystem.write, execution.shell, verification.run, web.research]
metadata:
  routing-group: design
  domain: "product"
---

# I18N Localization

## Selection card
- Task: Implement translation, plurals and bidirectional layout.
- Start: Identify the target surface, reference, user task and existing tokens.
- Finish: apply the acceptance checks below; report observed results and unresolved constraints.

## Overview

Production internationalization (i18n) and localization (l10n) go beyond string dictionaries: they require ICU/plural-aware message formatting, standard `Intl` number/date/list/collation formatting, logical CSS properties for bidirectional (LTR/RTL) layouts, and SSR-safe locale resolution without cross-request cache pollution.

Use current platform Intl and the project installed localization framework. Verify framework-specific server/client locale loading before changing packages.

## Rules

1. Model language/locale (`en-US`, `tr-TR`, `ar-SA`), user timezone, and billing/display currency as separate concepts with explicit fallback chains.
2. Use full-sentence ICU / plural / select message interpolation (`one`, `few`, `many`, `other`) rather than concatenating translated fragments or assuming English word order.
3. Keep numbers, timestamps (UTC / ISO-8601), and monetary amounts (integer minor units + ISO-4217 currency code) structured until display formatting via `Intl.NumberFormat` / `Intl.DateTimeFormat`.
4. Build adaptable layouts using CSS logical properties (`margin-inline-start`, `padding-inline`, `inset-inline-end`, `text-align: start`), `dir="rtl"` / `dir="auto"` attributes, and 30–40% text expansion room.
5. Localize `aria-label`, `alt` text, form validation errors, document `<title>` / `lang` / `hreflang` metadata, and transactional notifications.
6. Vary HTTP/SSR caches by resolved locale (`Vary` / route prefix) and never store active request locale in a shared server singleton.

## Core Patterns & Pitfalls

- **Bidirectional Layout Safety**: Replace physical directional CSS (`left`/`right`, `ml-*`/`mr-*`, `pl-*`/`pr-*`) with logical properties (`ms-*`/`me-*`, `ps-*`/`pe-*`, `start`/`end`) and mirror directional navigation icons (chevrons, back arrows) in RTL while keeping media playback and checkmarks unmirrored.
- **Locale-Sensitive Case & Sorting**: Use `str.toLocaleLowerCase(locale)` and `Intl.Collator(locale)` when upper/lowercasing or sorting user-visible text (e.g., Turkish dotted/dotless `İ`/`ı`), while keeping internal protocol tokens ASCII-invariant.
- **Anti-pattern — Currency Conversion via Locale Switch**: Changing the UI language from `en-US` to `de-DE` must reformat `100 USD` as `100,00 $`, never silently relabel the amount as `100,00 €`.

## Workflow

1. Inventory user-visible strings and current locale routing/catalogs.
2. Implement messages and formatting with stable keys and appropriate locale context.
3. Test plural/zero cases, long labels, RTL and actual date/currency boundaries.
4. Verify fallback/missing keys and server hydration/cache behavior.
5. Run existing completeness checks and inspect representative rendered journeys.

## Before returning

- [ ] Language, locale, timezone, and currency kept distinct with explicit fallback behavior
- [ ] Messages use complete parameterized/pluralized templates with no string concatenation
- [ ] Layouts use logical CSS properties, set `<html lang dir>`, and survive 35%+ text expansion and RTL
- [ ] Accessible labels (`aria-label`, `alt`), validation messages, and page metadata localized
- [ ] Server rendering and caching isolated per locale with zero hydration mismatches

## Sources

Versioned facts checked 2026-10-23; refresh authoritative sources before new installs/upgrades.
[Intl](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl), [W3C internationalization](https://www.w3.org/International/).

## Skills in scope

- design-system — create and maintain coherent visual tokens, themes and shared component states using the existing project system or WrongStack Design Studio.
- accessibility — implement and review accessible user interfaces with semantic controls, keyboard and focus behavior, readable content and assistive-technology checks.
- testing — verify plural categories, RTL layout reflow, missing-key fallbacks, and timezone/currency boundary formatting.
- nextjs-modern — build, migrate, and debug Next.js 16 App Router applications with React 19, Server Components, Server Actions, explicit caching, and production deployment.
