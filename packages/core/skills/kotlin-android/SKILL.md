---
name: kotlin-android
description: "Build and upgrade native Android applications with Kotlin, Compose/View UI and lifecycle-aware work. Use when implementing Android screens, navigation, permissions or background jobs; coordinate Kotlin, Gradle, AGP and SDK compatibility."
trigger: "Build and upgrade native Android applications with Kotlin, Compose/View UI and lifecycle-aware work. Use when implementing Android screens, navigation, permissions or background jobs; coordinate Kotlin, Gradle, AGP and SDK compatibility."
version: 1.0.2
required-capabilities: [filesystem.read]
required-tools: []
optional-capabilities: [filesystem.write, execution.shell, verification.run, web.research]
metadata:
  routing-group: mobile
  domain: "mobile"
paths: ["AndroidManifest.xml"]
---

# Kotlin Android

## Selection card
- Task: Build Kotlin Android and Jetpack Compose features.
- Start: Identify the platform, screen, device and native integration boundary.
- Finish: apply the acceptance checks below; report observed results and unresolved constraints.

## Overview

Modern Android applications combine Kotlin Coroutines/Flow, Jetpack Compose (with unidirectional data flow and lifecycle-aware state collection), Room/DataStore persistence, and Gradle Version Catalogs (`libs.versions.toml`). Reliable Android engineering requires coordinating Kotlin, Gradle, AGP, and `compileSdk`/`targetSdk` compatibility while ensuring UI state survives configuration changes and process death.

Checked 2026-10-23: Kotlin 2.4.21 and Gradle 9.8.2. Verify current AGP/Compose/compiler/JDK and Android SDK matrix; independently latest versions may not form a supported build.

## Rules

1. Inspect build plugins/version catalogs (`libs.versions.toml`), SDK levels, app id, manifests and signing variants.
2. Scope coroutines/flows to the correct lifecycle (`viewModelScope`, `collectAsStateWithLifecycle`) and preserve structured cancellation (never swallow `CancellationException`).
3. Keep UI state observable (`StateFlow` of immutable UI state) and ownership explicit; Compose recomposition is not permission to start duplicate side effects.
4. Handle permission denial, configuration changes, process recreation (`SavedStateHandle` / `rememberSaveable`), background restrictions (`WorkManager`), and edge-to-edge window insets as real product states.
5. Match predictive back navigation (`BackHandler` / Navigation Compose), window size classes, and TalkBack accessibility semantics.
6. Store sensitive app credentials in Android Keystore-backed mechanisms and authorize data operations on the server.

## Core Patterns & Pitfalls

- **Compose State & Side Effects**: Collect flows in Compose with `collectAsStateWithLifecycle()` and trigger lifecycle-bound side effects inside `LaunchedEffect(key)` or `DisposableEffect(key)`, never directly in composable function bodies.
- **Process Death Resilience**: Store user-entered draft IDs, filter keys, and navigation state in `SavedStateHandle` or `rememberSaveable`; in-memory `ViewModel` fields alone are wiped when the OS reclaims backgrounded processes.
- **Anti-pattern — Catching `Exception` over Coroutines**: A broad `catch (e: Exception)` inside a `suspend` function intercepts `CancellationException` and breaks structured concurrency unless `if (e is CancellationException) throw e` or `ensureActive()` is preserved.

## Workflow

1. Trace screen/ViewModel/repository and current UI/data conventions.
2. Verify the stable supported build-tool/SDK combination and migration steps.
3. Implement lifecycle-owned work and visible states.
4. Test process/lifecycle transitions, navigation, permissions and window sizes.
5. Run configured lint/tests/build and verify the app on a representative device.

## Before returning

- [ ] Kotlin, Gradle, AGP, Compose compiler, and `compileSdk`/`targetSdk` matrix verified
- [ ] Coroutines/Flows scoped cleanly with `CancellationException` propagation intact
- [ ] Compose state collected via `collectAsStateWithLifecycle` with side effects isolated to effect APIs
- [ ] Configuration change, process recreation (`SavedStateHandle`), edge-to-edge insets, and permission denial states handled
- [ ] Gradle unit/instrumentation tests, lint checks, and device vs emulator evidence reported

## Sources

Versioned facts checked 2026-10-23; refresh authoritative sources before new installs/upgrades.
[Kotlin releases](https://github.com/JetBrains/kotlin/releases), [Android architecture](https://developer.android.com/topic/architecture), [Android build](https://developer.android.com/build).

## Skills in scope

- mobile-design — design and implement mobile interfaces for touch, keyboards, safe areas and native navigation.
- mobile-performance — measure and improve mobile startup, scrolling, animation and resource usage on representative devices.
- mobile-release — prepare and verify signed mobile releases, test-channel distribution and store submission artifacts.
- offline-sync — implement offline-capable applications with local persistence, queued changes and explicit synchronization conflicts.
