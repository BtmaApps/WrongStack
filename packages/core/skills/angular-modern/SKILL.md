---
name: angular-modern
description: "Build and upgrade Angular applications with typed components, reactive state, dependency injection and verified routing. Use when working on Angular forms, signals, rendering or migration; inspect zoneless/zone-based behavior rather than assuming either mode."
trigger: "Build and upgrade Angular applications with typed components, reactive state, dependency injection and verified routing. Use when working on Angular forms, signals, rendering or migration; inspect zoneless/zone-based behavior rather than assuming either mode."
version: 1.0.2
required-capabilities: [filesystem.read]
required-tools: []
optional-capabilities: [filesystem.write, execution.shell, verification.run, web.research]
metadata:
  routing-group: frontend
  domain: "web"
paths: ["angular.json", "*.component.ts"]
---

# Angular Modern

## Selection card
- Task: Angular signals and standalone components.
- Start: Locate the affected route/component and its runtime/lockfile.
- Finish: apply the acceptance checks below; report observed results and unresolved constraints.

## Overview

Modern Angular applications combine standalone components, signal-based reactivity (`signal`, `computed`, `linkedSignal`, `resource`), and configurable change detection (Zone.js or zoneless via `provideZonelessChangeDetection()`). Reliable Angular engineering requires aligning reactive state derivations with component lifecycles, preserving SSR/hydration determinism, and respecting strict compiler/TypeScript peer ranges.

Checked 2026-10-23: Angular core/compiler-cli 22.2.3 and Angular CLI 22.2.4. Coordinate framework/compiler/CLI packages. Compiler-cli 22.2.3 declares TypeScript >=6.0 <6.1, so current TypeScript 7.0.2 is outside its supported range. Report this blocker; do not force the peer combination.

## Rules

1. Identify bootstrap, standalone/module conventions and change-detection mode.
2. Keep derivation in computed state and side effects at intentional boundaries; do not create circular effect synchronization.
3. Clean up observable subscriptions, async work and component resources using supported ownership/lifecycle APIs (`takeUntilDestroyed`, `DestroyRef`).
4. Treat route guards and UI controls as navigation policy, not server authorization.
5. Use typed forms (`FormGroup<{ ... }>`, `NonNullableFormBuilder`) and explicit pending/error states; validation semantics must match the server.
6. Check SSR/hydration and browser-only APIs (`afterNextRender`) in the configured rendering mode.

## Core Patterns & Pitfalls

- **Signals vs RxJS**: Use `signal()` and `computed()` for synchronous UI state and template bindings; reserve RxJS streams for event choreography, cancellation, and multi-step async pipelines, bridging with `toSignal()` / `toObservable()` inside an injection context.
- **Anti-pattern — State writes inside `effect()`**: Writing back to signals inside `effect()` creates implicit cycles and timing bugs. Prefer `computed()` for derived state or `linkedSignal()` when state resets on an upstream signal change.
- **SSR & Hydration**: Gate DOM measurement and `window`/`localStorage` access inside `afterNextRender()`, and avoid mutating DOM nodes outside Angular's template renderer before hydration completes.

## Workflow

1. Inspect project config, component/data conventions and supported version matrix.
2. Upgrade through official migrations when requested and review generated changes.
3. Implement the narrow feature with existing dependency and state boundaries.
4. Test navigation, forms, change-detection notifications, lifecycle and SSR as applicable.
5. Run configured type/lint/tests and production build.

## Before returning

- [ ] Angular core, CLI, and TypeScript peer version matrix verified and blockers reported
- [ ] Change-detection mode (zoneless vs Zone.js) and standalone/module boundaries preserved
- [ ] Derived state expressed via `computed`/`linkedSignal` without circular `effect` writes
- [ ] Subscriptions and async work cleaned up via `DestroyRef` / `takeUntilDestroyed`
- [ ] Typed forms, SSR/hydration safety, and production build verified

## Sources

Versioned facts checked 2026-10-23; refresh authoritative sources before new installs/upgrades.
[Angular compatibility](https://angular.dev/reference/versions), [Zoneless](https://angular.dev/guide/zoneless).

## Skills in scope

- typescript-strict — enforce strict template and component type safety across signals, inputs, and dependency injection tokens.
- api-design — align Angular HTTP client DTOs, error envelopes, and server validation contracts.
- testing — verify component signal transitions, router guards, and form states with deterministic harnesses.
- design-system — create and maintain coherent visual tokens, themes and shared component states using the existing project system or WrongStack Design Studio.
