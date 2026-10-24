---
name: mobile-performance
description: "Measure and improve mobile startup, scrolling, animation and resource usage on representative devices. Use when diagnosing React Native/Flutter/native performance; compare release builds under matched conditions rather than promising a universal frame rate."
trigger: "Measure and improve mobile startup, scrolling, animation and resource usage on representative devices. Use when diagnosing React Native/Flutter/native performance; compare release builds under matched conditions rather than promising a universal frame rate."
version: 1.0.2
required-capabilities: [filesystem.read]
required-tools: []
optional-capabilities: [filesystem.write, execution.shell, verification.run, web.research]
metadata:
  routing-group: mobile
  domain: "mobile"
---

# Mobile Performance

## Selection card
- Task: Profile device startup, scrolling and memory.
- Start: Identify the platform, screen, device and native integration boundary.
- Finish: apply the acceptance checks below; report observed results and unresolved constraints.

## Overview

Mobile performance engineering targets measurable user-perceived latency: cold/warm Time to Initial Display (TTID) and Time to Full Display (TTFD), 60/120Hz frame pacing (jank / hitch rate), scroll responsiveness, memory footprint across repeated screen navigation, and battery/thermal efficiency. Because debug builds inject JIT/dev-menu/assertion overhead, valid optimization requires profiling release or profile builds under matched conditions.

Use the current framework profiler and platform tools supported by the installed app/toolchain; latest framework targets are verified in the corresponding implementation skills.

## Rules

1. Record device model, OS version, build mode (`release` / `profile`), dataset size, thermal/battery state and cold/warm start conditions.
2. Separate JS/Dart thread work, UI/main-thread layout, GPU/raster work, and native bridge/I/O latency before choosing an optimization.
3. Measure the real user journey: startup readiness, touch-to-paint latency, list scroll frame times, and heap retention across repeated push/pop navigation.
4. Virtualize large collections, size decoded images to display dimensions, and stabilize unnecessary re-renders only where a trace proves cost.
5. Dispose owned subscriptions, controllers, bitmaps/textures, and native listeners; a lower initial heap does not prove navigation leaks are fixed.
6. Avoid debug-mode comparisons for production claims and keep accessibility and visual correctness in the acceptance check.

## Core Patterns & Pitfalls

- **Startup Critical Path**: Defer non-essential SDK initialization, analytics, and secondary database warming until after the first interactive frame renders.
- **Image & List Memory**: Downsample remote/local images to target viewport pixel dimensions before decoding; oversized bitmaps are the primary cause of mobile OOM kills during fast list scrolling.
- **Anti-pattern — Blind Memoization Without Traces**: Wrapping every function in `useMemo`/`useCallback` or adding ad-hoc caches without a frame/CPU trace adds allocation overhead while leaving main-thread or bridge bottlenecks untouched.

## Workflow

1. Reproduce the slow journey in a release/profile build.
2. Capture profiler evidence and identify the dominant frame/task/resource bottleneck.
3. Make a narrow change and repeat matched measurements with multiple samples.
4. Test low-resource and lifecycle conditions relevant to the product.
5. Report sample counts, distribution, conditions, behavior checks and tradeoffs.

## Before returning

- [ ] Baseline and post-change measurements captured in `release` or `profile` mode under matched conditions
- [ ] Bottleneck localized to specific thread/layer (UI/main, JS/Dart, raster/GPU, I/O, or memory allocation)
- [ ] Repeated screen push/pop navigation checked for retained heap/listener leaks
- [ ] Sample count, median/p95 numbers, and physical device vs emulator/simulator limits reported
- [ ] Visual fidelity, accessibility semantics, and state correctness preserved

## Sources

Versioned facts checked 2026-10-23; refresh authoritative sources before new installs/upgrades.
[React Native performance](https://reactnative.dev/docs/performance), [Flutter performance](https://docs.flutter.dev/perf), [Android performance](https://developer.android.com/topic/performance).

## Skills in scope

- react-native-expo — Fabric/TurboModule rendering, Reanimated worklets, and FlashList optimization.
- flutter-mobile — Impeller rasterization, isolate offloading, and widget rebuild scoping.
- swift-ios — Instruments (Time Profiler, Allocations, Core Animation hitches) and `@MainActor` latency.
- kotlin-android — Macrobenchmark, Baseline Profiles, Perfetto traces, and Compose recomposition counts.
- observability — production startup, ANR/crash-free rate, and slow/frozen frame telemetry.
