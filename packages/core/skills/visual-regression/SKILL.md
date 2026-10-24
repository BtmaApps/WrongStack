---
name: visual-regression
description: "Detect unintended UI changes with reproducible rendered screenshots and reviewed baselines. Use when adding screenshot checks or investigating layout/theme regressions; do not approve a changed image merely to make the test green."
trigger: "Detect unintended UI changes with reproducible rendered screenshots and reviewed baselines. Use when adding screenshot checks or investigating layout/theme regressions; do not approve a changed image merely to make the test green."
version: 1.0.2
required-capabilities: [filesystem.read]
required-tools: []
optional-capabilities: [filesystem.write, execution.shell, verification.run, web.research]
metadata:
  routing-group: design
  domain: "design"
---

# Visual Regression

## Selection card
- Task: Compare rendered UI states against screenshot baselines.
- Start: Identify the target surface, reference, user task and existing tokens.
- Finish: apply the acceptance checks below; report observed results and unresolved constraints.

## Overview

Visual regression testing catches unintended layout shifts, token drift, clipping, z-index collisions, and dark/light theme regressions by comparing rendered component or page screenshots against reviewed baselines. Reliable visual diffs require deterministic rendering conditions (pinned fonts, frozen clock/random seeds, disabled animations, stable network fixtures) and disciplined baseline review.

Current checked targets: Playwright 1.64.1 and Storybook React 10.6.3 (2026-10-23). Refresh registry and browser/tool compatibility before installation.

## Rules

1. Pin viewport dimensions, browser engine, device scale factor, locale, color scheme, web fonts, clock, and fixture data.
2. Wait for actual visual readiness: `document.fonts.ready`, image decode completion, network/skeleton resolution, and `animations: 'disabled'`. Arbitrary sleeps produce flaky baselines.
3. Mask only intentionally dynamic regions (live video, third-party embeds) with a documented reason; masking the component under test defeats the check.
4. Separate cross-OS font rasterization noise (solve via containerized/CI Linux runners) from real geometry, color, spacing, or state regressions.
5. Inspect every actual/expected/diff image triplet against the user's requested change before updating a baseline (`--update-snapshots`).
6. Keep screenshot assertions paired with semantic/behavioral checks; matching pixels alone do not prove keyboard focus or ARIA states work.

## Core Patterns & Pitfalls

- **Deterministic Playwright Snapshot**: Freeze time (`page.clock.setFixedTime(...)`), await locator stability, and call `await expect(locator).toHaveScreenshot('name.png', { animations: 'disabled' })` scoped to the target component or full viewport as appropriate.
- **State Matrix Coverage**: Capture high-risk visual states—default, hover/focus-visible, validation error, empty state, long-text overflow, and dark mode—at both desktop (1280–1440px) and narrow mobile (375–390px) widths.
- **Anti-pattern — Blind `--update-snapshots`**: Never regenerate baselines to silence a failing CI check without inspecting the diff image and confirming every pixel change is intentional.

## Workflow

1. Choose representative routes/components and the states most likely to regress.
2. Capture a deterministic baseline through the configured browser/story workflow.
3. Inspect the diff image and trace the owning component/theme change.
4. Fix the source or accept an intended baseline change with evidence.
5. Rerun the same conditions, then the affected interaction tests.

## Before returning

- [ ] Viewport, theme, font loading, clock, and animation state pinned deterministically
- [ ] Actual, expected, and diff images inspected for every modified snapshot
- [ ] Any masked locators or pixel thresholds justified and scoped narrowly
- [ ] Unintended visual regressions fixed in source rather than baked into updated baselines
- [ ] Behavioral and accessibility assertions verified alongside screenshot checks

## Sources

Versioned facts checked 2026-10-23; refresh authoritative sources before new installs/upgrades.
[Playwright snapshots](https://playwright.dev/docs/test-snapshots), [Storybook visual testing](https://storybook.js.org/docs/writing-tests/visual-testing).

## Skills in scope

- testing — combine visual snapshot assertions with behavioral and edge-case functional tests.
- design-critique — evaluate visual hierarchy, spacing rhythm, and token adherence when reviewing diffs.
- accessibility — verify focus indicators, contrast ratios, and zoom/reflow behavior alongside visual snapshots.
