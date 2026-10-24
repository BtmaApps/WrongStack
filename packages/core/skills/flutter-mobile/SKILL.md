---
name: flutter-mobile
description: "Build and upgrade Flutter applications with typed state, navigation, platform plugins and device verification. Use when implementing Flutter screens or resolving Flutter/Dart integration; distinguish stable SDK releases from future branch schedules."
trigger: "Build and upgrade Flutter applications with typed state, navigation, platform plugins and device verification. Use when implementing Flutter screens or resolving Flutter/Dart integration; distinguish stable SDK releases from future branch schedules."
version: 1.0.2
required-capabilities: [filesystem.read]
required-tools: []
optional-capabilities: [filesystem.write, execution.shell, verification.run, web.research]
metadata:
  routing-group: mobile
  domain: "mobile"
paths: ["pubspec.yaml", "*.dart"]
---

# Flutter Mobile

## Selection card
- Task: Build Flutter widgets, state and platform integration.
- Start: Identify the platform, screen, device and native integration boundary.
- Finish: apply the acceptance checks below; report observed results and unresolved constraints.

## Overview

Flutter applications pair reactive widget trees and Impeller rendering with Dart's sound null safety, isolates, and native platform channels. Reliable Flutter engineering requires pure `build()` methods, deterministic controller/stream disposal, `context.mounted` guards across async gaps, and strict alignment between the Flutter SDK release and its bundled Dart SDK.

Checked 2026-10-23: Flutter 3.47.8 stable with bundled Dart SDK 3.13.7 (verified via official releases_linux.json). Use its bundled Dart SDK, not an independently guessed Dart upgrade. Refresh the official stable archive before installation; future Flutter 3.50 scheduling is not a released stable target.

## Rules

1. Inspect `pubspec.yaml`, lockfile, analysis rules, SDK pin and native platform configuration (`ios/`, `android/`, `macos/`, `web/`).
2. Match plugin support and native build requirements (Gradle/AGP/Kotlin on Android, Xcode/CocoaPods/SwiftPM on iOS) to the chosen Flutter stable release.
3. Keep `build()` methods pure and side-effect-free; scope `TextEditingController`, `AnimationController`, `FocusNode`, and stream subscriptions to their owner and dispose them in `dispose()`.
4. Model loading/error/success state explicitly and guard `BuildContext` or `setState` usage after `await` with `if (!mounted) return;` / `if (!context.mounted) return;`.
5. Use layout constraints (`LayoutBuilder`, `MediaQuery.sizeOf`, `SafeArea`, `SliverList.builder`) and semantic widgets rather than hardcoded pixel dimensions or text-scale assumptions.
6. Treat platform channels (`MethodChannel`, `EventChannel`, Pigeon) as validated contracts with bounded errors/cancellation; do not hide `PlatformException` behind generic success.

## Core Patterns & Pitfalls

- **Rebuild Scoping**: Push `const` constructors down the widget tree and subscribe to narrow slices of state (`ValueListenableBuilder`, `Selector`, Riverpod `.select`) so high-frequency updates (scroll, animation, timers) do not rebuild whole screens.
- **Heavy Compute Off UI Isolate**: Offload large JSON decoding, image processing, or crypto work with `Isolate.run()` so UI frame budgets stay under 8–16ms.
- **Anti-pattern — Creating Controllers in `build()`**: Instantiating controllers, Futures (`FutureBuilder(future: fetchItems())`), or streams directly inside `build()` restarts work and leaks resources on every parent rebuild.

## Workflow

1. Read official migration notes and inspect the project's state/navigation pattern.
2. Implement the feature with existing widgets/theme and typed models.
3. Exercise long content, keyboard, back navigation, permission denial and app resume.
4. Run configured analyze/tests, widget/golden checks where relevant and platform builds.
5. Verify the actual device journey and report build/runtime limitations.

## Before returning

- [ ] Stable Flutter version and bundled Dart SDK constraint verified in `pubspec.yaml`
- [ ] All controllers, focus nodes, and stream subscriptions disposed in `dispose()`
- [ ] Async callbacks check `mounted` / `context.mounted` before touching state or navigation
- [ ] `flutter analyze` and widget/unit tests pass with zero warnings on touched code
- [ ] Native plugin compatibility and simulator/device vs widget-test scope explicitly reported

## Sources

Versioned facts checked 2026-10-23; refresh authoritative sources before new installs/upgrades.
[Stable SDK archive](https://docs.flutter.dev/install/archive), [Confirmed release tag](https://flutter.googlesource.com/mirrors/flutter/+/refs/tags/3.47.8), [Flutter testing](https://docs.flutter.dev/testing).

## Skills in scope

- mobile-design — adaptive touch targets, safe areas, keyboard insets, and platform navigation idioms.
- mobile-performance — Impeller frame rasterization, shader/jank profiling, and isolate memory verification.
- mobile-release — iOS/Android signing, build flavors, and store artifact verification.
- offline-sync — local SQLite/Drift persistence, outbox queues, and conflict resolution across connectivity drops.
