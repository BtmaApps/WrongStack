---
name: motion-design
description: "Implement web and React animation, gesture feedback, layout transitions and scroll sequences. Use when working with Motion, GSAP or CSS animation; use motion-canvas-video for exported timeline videos and threejs-3d for rendered 3D scenes."
version: 1.2.2
required-capabilities: [filesystem.read, filesystem.write]
required-tools: []
optional-capabilities: [verification.run, web.research]
trigger: "working with Motion, GSAP or CSS animation; use motion-canvas-video for exported timeline videos and threejs-3d for rendered 3D scenes."
metadata:
  routing-group: media
---

# Motion Design

## Selection card
- Task: Animate live web UI transitions and gestures.
- Start: Identify the existing engine, scene, timeline and delivery format.
- Finish: apply the acceptance checks below; report observed results and unresolved constraints.

## Overview

Latest stable targets checked 2026-10-23: Motion 14.6.0, GSAP 3.15.0 and
Tailwind CSS 4.3.3. For new React animation work, Motion imports from motion/react.
Inspect existing package APIs and migration notes before upgrading; renaming
framer-motion alone is not a validated migration.

## Rules

1. Give each animation a purpose: state feedback, spatial continuity, attention
   or storytelling. Keep core actions usable if animation is disabled.
2. Prefer CSS for small transitions; use the existing animation library where
   orchestration, interruption or layout continuity needs it.
3. Prefer transform and opacity on hot paths. Layout animation APIs and occasional
   size transitions can be appropriate; profile their actual cost instead of
   banning all width/height animation.
4. Honor reduced motion. Remove parallax and large travel/zoom; retain necessary
   state feedback through short fades or instant changes.
5. Preserve semantics and focus through enter/exit transitions. Use actual buttons
   and links for actions; hover alone cannot carry information.
6. Clean up timelines, subscriptions and ScrollTrigger instances on unmount.
   Strict Mode, interrupted transitions and route changes must not duplicate them.

## Workflow

1. Define states, interrupted-state behavior, duration/easing roles and mobile
   adaptation using the project tokens.
2. For Motion, consider MotionConfig reducedMotion='user', useReducedMotion and
   AnimatePresence for real exit states. Use stable keys and measure layout
   when geometry changes.
3. For GSAP, scope nodes to the owning component with context or the supported
   React integration. Revert on cleanup; avoid accumulating global triggers.
4. Stress rapid toggle, pending/disabled states, keyboard flow, reduced motion,
   route changes and a representative low-powered device.
5. Inspect traces for long tasks/layout work. Report the measured result instead
   of promising 60/120 fps on every device.

## Core Patterns & Pitfalls

- **Duration & Easing Choreography**: Keep micro-interactions (hover, press, toggle) snappy (`120–180ms`, ease-out), layout/panel transitions concise (`200–320ms`, custom cubic-bezier or critically damped spring with low bounce), and exit transitions faster than entrances so UI never feels sluggish.
- **`AnimatePresence` & Layout Projection**: Place `AnimatePresence` *outside* the conditional branch (`<AnimatePresence>{isOpen && <motion.div key="modal" exit={{ opacity: 0 }} />}</AnimatePresence>`) with unique stable `key` props, and add `layout="position"` on text children inside `layout`-animated containers to prevent font stretching.
- **Anti-pattern — Uncleaned GSAP `ScrollTrigger` or Staggered Input Lockout**: Creating `ScrollTrigger` instances without `useGSAP()` / `gsap.context().revert()` leaks pin spacers across route navigations, and blocking pointer/keyboard input until a long decorative stagger finishes degrades usability.

## Sources

[Motion accessibility](https://motion.dev/docs/react-accessibility),
[Tailwind theme variables](https://tailwindcss.com/docs/theme).

## Acceptance checks

- [ ] Motion imports (`motion/react`) or GSAP versions match the repository's installed packages
- [ ] `prefers-reduced-motion` honored (`MotionConfig reducedMotion="user"`, `useReducedMotion()`, or `gsap.matchMedia()`)
- [ ] Rapid interruption, unmount cleanup (`AnimatePresence` keys, `gsap.context().revert()`), and Strict Mode double-mount verified
- [ ] Keyboard focus order, ARIA state announcements, and zero unexpected CLS preserved throughout transitions

## Skills in scope

- design-system — shared duration, easing, and spring tokens across components.
- design-craft — choreographing visual hierarchy, spatial continuity, and restraint.
- accessibility — `prefers-reduced-motion` adaptation and focus preservation across animated dialogs/menus.
- web-performance — verifying compositor promotion, main-thread frame times, and zero layout-shift regressions.
