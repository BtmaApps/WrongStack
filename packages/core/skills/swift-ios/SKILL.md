---
name: swift-ios
description: "Build and upgrade native iOS applications with Swift, SwiftUI/UIKit and correct lifecycle/concurrency ownership. Use when implementing native screens, platform integrations or Swift migrations; verify toolchain, deployment target and device behavior separately."
trigger: "Build and upgrade native iOS applications with Swift, SwiftUI/UIKit and correct lifecycle/concurrency ownership. Use when implementing native screens, platform integrations or Swift migrations; verify toolchain, deployment target and device behavior separately."
version: 1.0.2
required-capabilities: [filesystem.read]
required-tools: []
optional-capabilities: [filesystem.write, execution.shell, verification.run, web.research]
metadata:
  routing-group: mobile
  domain: "mobile"
paths: ["*.swift", "Package.swift", "Info.plist"]
---

# Swift Ios

## Selection card
- Task: Build SwiftUI and Apple platform features.
- Start: Identify the platform, screen, device and native integration boundary.
- Finish: apply the acceptance checks below; report observed results and unresolved constraints.

## Overview

Modern iOS applications use Swift 6 strict concurrency (`@MainActor`, `Sendable`, actors, structured `Task` hierarchies) alongside SwiftUI's `@Observable` data flow and UIKit interoperability. Reliable iOS engineering requires aligning Swift language mode with the minimum deployment target, cancelling in-flight tasks on view disappearance, and checking actor hops across suspension points.

Checked stable Swift target: 6.4.1 on 2026-10-23. Xcode/SDK, Swift language mode and minimum deployment OS are separate constraints; verify current supported combinations before migration.

## Rules

1. Inspect project/schemes, minimum deployment targets (`iOS`), entitlements, Privacy Manifest (`PrivacyInfo.xcprivacy`), and SwiftPM/CocoaPods pins.
2. Keep UI state ownership explicit (`@State` with `@Observable` models or `@StateObject` with `ObservableObject`) and isolate UI mutations to `@MainActor`.
3. Scope async work with SwiftUI `.task(id:)` or cancelled `Task` handles; check `Task.isCancelled` / `try Task.checkCancellation()` after suspension points so stale completions cannot overwrite newer state.
4. Use Keychain for credentials, handle permission `.denied` / `.restricted` states gracefully, and keep authorization on the server.
5. Match native `NavigationStack` / sheet transitions, Dynamic Type scaling, safe areas, keyboard avoidance, and VoiceOver traits/labels.
6. Do not label a simulator build as signed-device or App Store release proof.

## Core Patterns & Pitfalls

- **SwiftUI `.task(id:)` Lifecycle**: Prefer `.task(id: selection)` over spawning unstructured `Task { ... }` inside `.onAppear` so SwiftUI automatically cancels and restarts async work when the view disappears or the identifier changes.
- **Actor Reentrancy**: Actor state can change across any `await` suspension point. Re-validate cached invariants after `await` rather than assuming pre-await state still holds.
- **Anti-pattern — Recreating Models in `View.init`**: Initializing reference-type models inside a SwiftUI `View`'s `init` without `@State` / `@StateObject` recreates the model and drops in-flight state on every parent re-evaluation.

## Workflow

1. Trace screen/model/service ownership and current SwiftUI/UIKit conventions.
2. Verify stable toolchain and migration effects on concurrency and packages.
3. Implement the feature with intentional actor/lifecycle boundaries.
4. Test background/resume, cancellation, permissions, large text and navigation.
5. Build/test the selected scheme and verify representative device behavior.

## Before returning

- [ ] Swift version, language mode (Swift 5 vs Swift 6 concurrency), and minimum iOS deployment target verified
- [ ] UI state mutations isolated to `@MainActor` with `Sendable` boundaries respected
- [ ] Async work tied to `.task(id:)` or explicit cancellation handles and checked after `await`
- [ ] Dynamic Type, safe areas, VoiceOver labels, and permission denial states verified
- [ ] Simulator vs physical device vs signed archive evidence clearly distinguished

## Sources

Versioned facts checked 2026-10-23; refresh authoritative sources before new installs/upgrades.
[Swift releases](https://www.swift.org/install/), [Apple development](https://developer.apple.com/documentation/).

## Skills in scope

- mobile-design — design and implement mobile interfaces for touch, keyboards, safe areas and native navigation.
- mobile-performance — measure and improve mobile startup, scrolling, animation and resource usage on representative devices.
- mobile-release — prepare and verify signed mobile releases, test-channel distribution and store submission artifacts.
- authentication-sessions — implement application sign-in, sessions and identity integration with explicit account/tenant authorization.
