---
name: interaction-design
description: "Design and implement task-oriented interaction flows, forms, navigation and recovery states. Use when improving onboarding, complex workflows or interaction behavior; use design-system for tokens and design-craft for visual composition."
trigger: "Design and implement task-oriented interaction flows, forms, navigation and recovery states. Use when improving onboarding, complex workflows or interaction behavior; use design-system for tokens and design-craft for visual composition."
version: 1.1.0
required-capabilities: [filesystem.read]
required-tools: []
optional-capabilities: [filesystem.write, execution.shell, verification.run, web.research]
metadata:
  routing-group: design
  domain: "design"
---

# Interaction Design

## Selection card
- Task: Design user journeys, feedback and recovery.
- Start: Identify the target surface, reference, user task and existing tokens.
- Finish: apply the acceptance checks below; report observed results and unresolved constraints.

## Overview

Design and implement task-oriented interaction flows, forms, navigation and recovery states.

Use the current project design system and actual platform conventions. Refresh platform guidance before choosing a new interaction model.

## Rules

1. Describe the user task, entry points, completion and recovery before drawing screens.
2. Map state transitions: loading, empty, partial success, invalid input, retry, cancel and interrupted work.
3. Separate immediate UI state from durable business state; optimistic feedback must reconcile rejected writes.
4. Preserve focus and accessible names through navigation and overlays. Hover or drag cannot be the sole route to an action.
5. Match native/browser navigation expectations. A back action must not unexpectedly repeat a payment or lose draft data.
6. Use progressive disclosure for genuine complexity; do not hide required information solely to make a screen sparse.

## Workflow

1. Trace the current journey and identify where users hesitate, repeat work or become stranded.
2. Specify a small state/transition map and representative content, including long/localized labels.
3. Implement the flow using shared primitives and existing validation/data boundaries.
4. Exercise keyboard/touch, failed submission, retry, duplicate action and interrupted navigation.
5. Inspect the rendered journey and revise the highest-impact observed issue.

## Measurable acceptance

Structure each flow with a pattern id from design-patterns (`forms-and-flows.md`,
`feedback-states.md`): e.g. `single-column-form`, `multi-step-wizard`,
`inline-edit`, `destructive-confirm`, `undo-action`, `error-state`. Then check:

| Area | Check | How to observe |
|---|---|---|
| Response time | Feedback for an action starts within ~0.1s; a spinner or skeleton after ~1s; work over ~10s shows progress and can be cancelled | Throttle the network in the browser and act |
| Async states | Every async action has idle, pending, success and error; pending blocks a duplicate submit | Double-click submit; the request runs once |
| Validation | The error is beside its field, tied by `aria-describedby`, and says how to fix it; on submit, focus moves to the first invalid field; input is never cleared | Submit an invalid form with the keyboard only |
| Recovery | Failed writes keep the user's data; retry is offered where the failure is transient | Fail the request (offline / 500) and retry |
| Destruction | Irreversible actions confirm by naming the object, or offer undo | Delete something; read the dialog |
| Navigation | Back never repeats a payment or loses a draft; deep links restore state | Use browser back mid-flow |
| Overlays | Opening a dialog moves focus into it; Escape closes it; focus returns to the trigger | Tab, Escape, Tab |

Run `design {action:"inspect", url, surface:"app"}` on each reachable state you
can load by URL; `a11y.target-size` and `a11y.text-contrast` apply to error and
disabled states too. Record each check as observed / not observed in `.design/review.md`.

## Before returning

Main task and recovery paths work; focus and draft ownership are explicit; observed checks cite the route/state and unresolved gaps.

## Sources

Versioned facts checked 2026-10-09; refresh authoritative sources before new installs/upgrades.
[Android interaction guidance](https://developer.android.com/design/ui/mobile), [ARIA patterns](https://www.w3.org/WAI/ARIA/apg/patterns/).

## Skills in scope

- design-system — tokens and shared component state.
- design-craft — product-specific composition.
- accessibility — keyboard and assistive interaction.
- testing — behavioral and failure-path verification.
