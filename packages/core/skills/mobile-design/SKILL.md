---
name: mobile-design
description: "Design and implement mobile interfaces for touch, keyboards, safe areas and native navigation. Use when creating phone/tablet/foldable screens or adapting web ideas to mobile; platform behavior and device evidence matter alongside visual tokens."
trigger: "Design and implement mobile interfaces for touch, keyboards, safe areas and native navigation. Use when creating phone/tablet/foldable screens or adapting web ideas to mobile; platform behavior and device evidence matter alongside visual tokens."
version: 1.1.1
required-capabilities: [filesystem.read]
required-tools: []
optional-capabilities: [filesystem.write, execution.shell, verification.run, web.research]
metadata:
  routing-group: mobile
  domain: "mobile"
---

# Mobile Design

## Selection card
- Task: Design native touch layouts and safe-area behavior.
- Start: Identify the platform, screen, device and native integration boundary.
- Finish: apply the acceptance checks below; report observed results and unresolved constraints.

## Overview

Mobile interface design adapts user tasks to thumb zones, dynamic safe-area insets (notches, Dynamic Island, gesture bars), on-screen virtual keyboards, variable window size classes (compact phones, foldables, tablets), and native iOS HIG / Material 3 navigation idioms. High-craft mobile UI keeps primary actions reachable when the keyboard is open and respects OS-level Dynamic Type and gesture expectations.

Use current iOS/Android guidance and the app supported OS/device matrix. Refresh platform/store requirements rather than assuming a framework SDK minimum is the store submission target.

## Rules

1. Design from the task and available window space, not a fixed phone width.
2. Account for safe areas, edge-to-edge content, keyboard insets and reachable primary actions.
3. Respect platform back/navigation, sheets, gestures and focus behavior; provide explicit alternatives for essential gestures.
4. Use touch affordances and spacing suitable for the task/device; web CSS pixels and native logical units are not interchangeable.
5. Support dynamic text, localized content, dark/forced contrast and screen-reader semantics.
6. Preserve drafts and communicate interrupted/network/permission states rather than assuming uninterrupted foreground use.

## Workflow

1. Identify platform, primary task, device/window sizes and existing components.
2. Define navigation and key state transitions before composition.
3. Implement with native/adaptive primitives and shared tokens.
4. Test keyboard open, large text, rotation/resizing, back navigation and narrow/short content windows.
5. Inspect on representative devices and record actual behavior.

## Measurable acceptance

| Area | Threshold | Source / how to check |
|---|---|---|
| Touch targets | ≥ 24×24 CSS px is the floor; use 44×44 pt (iOS) or 48×48 dp (Android) for primary controls | WCAG 2.2 SC 2.5.8; Apple HIG; Material. Web: `inspect` rule `a11y.target-size` at 390 |
| Narrow width | No sideways scroll and ≥ 8px gutters at 390 and 320 CSS px | `inspect` with `viewports:[390, 320]`: `layout.horizontal-overflow`, `layout.text-at-edge` |
| Short window | Primary action reachable with the on-screen keyboard open and at ~600px tall | Focus the last input; the submit control stays reachable without a hidden scroll |
| Safe areas | Content clears notches and home indicators; web pages use `viewport-fit=cover` with `env(safe-area-inset-*)` padding only where content reaches the edge | Device or simulator screenshot, landscape too |
| Large text | Layout holds at the largest accessibility text size; essential text wraps instead of truncating | iOS Dynamic Type / Android font scale at max |
| Navigation | A bottom tab bar holds 3–5 destinations; back always works and never loses a draft | design-patterns `bottom-tab-bar`; Android back / iOS swipe |
| Viewport units (web) | Full-height layouts use dynamic or small viewport units (dvh / svh), not 100vh, where the browser chrome resizes | Check support in web-platform-baseline before relying on it |

Web-rendered mobile surfaces should pass `design_reference {action:"inspect", url,
viewports:[390, 320], surface:"app"}` with 0 FAIL. Native screens are outside
`inspect`; use device screenshots and the same table by hand, and say so.

## Before returning

- [ ] Primary interactive targets meet 44×44 pt (iOS) / 48×48 dp (Android) sizing with >= 8px separation
- [ ] Safe-area insets (`SafeArea` / `env(safe-area-inset-*)`), keyboard open state, and 320–390px narrow widths verified with zero horizontal overflow
- [ ] Platform back gesture/button, bottom sheet dismissal, and tab/stack navigation preserve user drafts
- [ ] Dynamic Type / maximum OS font scaling and screen-reader (`VoiceOver` / `TalkBack`) labels verified
- [ ] Observed device/simulator or browser-viewport evidence recorded transparently

## Sources

Versioned facts checked 2026-10-23; refresh authoritative sources before new installs/upgrades.
[Android mobile design](https://developer.android.com/design/ui/mobile), [Apple HIG](https://developer.apple.com/design/human-interface-guidelines).

## Skills in scope

- interaction-design — form flows, optimistic/offline feedback states, and gesture-to-button fallbacks.
- design-system — platform-adaptive spacing, typography scales, color roles, and component tokens.
- accessibility — VoiceOver/TalkBack focus order, touch target minimums, and high-contrast legibility.
- mobile-performance — keeping scroll lists, sheet transitions, and keyboard animations jank-free on real devices.
