---
name: react-native-expo
description: "Build and upgrade React Native or Expo applications with navigation, native modules and verified platform integration. Use when implementing mobile screens, Expo Router flows or device capabilities; choose a supported SDK combination rather than forcing independent latest packages together."
trigger: "Build and upgrade React Native or Expo applications with navigation, native modules and verified platform integration. Use when implementing mobile screens, Expo Router flows or device capabilities; choose a supported SDK combination rather than forcing independent latest packages together."
version: 1.0.2
required-capabilities: [filesystem.read]
required-tools: []
optional-capabilities: [filesystem.write, execution.shell, verification.run, web.research]
metadata:
  routing-group: mobile
  domain: "mobile"
paths: ["eas.json", "metro.config.*"]
---

# React Native Expo

## Selection card
- Task: Build React Native and Expo app screens.
- Start: Identify the platform, screen, device and native integration boundary.
- Finish: apply the acceptance checks below; report observed results and unresolved constraints.

## Overview

React Native (New Architecture / Fabric / TurboModules) and Expo SDK combine declarative native UI, file-based routing (`expo-router`), and config-plugin native generation. Shipping reliable mobile screens requires keeping dependencies aligned with the active Expo SDK matrix, handling safe areas, keyboard avoidance, and cold/warm deep links, and distinguishing JS-only changes from native binary rebuilds.

Checked 2026-10-23: React Native 0.88.0, Expo 58.0.17, Expo Router 58.0.25, Reanimated 4.7.1 and React Navigation 7.5.1. Expo SDK 58 bundles RN 0.88.0 and Reanimated 4.7.1; Expo Router 58.0.25 pins react-server-dom-webpack ~19.3.0 while standalone React is 19.3.1. Refresh the matrix before setup.

## Rules

1. Identify Expo-managed/prebuild/bare workflow, installed SDK and generated native directories (`ios/`, `android/`).
2. For latest independent React/RN targets, use a verified bare combination when Expo support lags. For Expo, report its supported matrix explicitly; do not silently downgrade or suppress dependency checks.
3. Install native dependencies through the project's Expo-compatible flow (`npx expo install`) when appropriate; inspect config plugins and generated native changes.
4. Keep navigation, deep links, auth redirects and back behavior consistent across cold/warm launches.
5. Request device permissions at the actual feature boundary and handle denial/revocation/settings redirect without a crash.
6. Keep credentials in supported secure storage (`expo-secure-store` / Keychain / Keystore) and server authorization at the server; an app bundle is publicly inspectable.

## Core Patterns & Pitfalls

- **List & Render Discipline**: Render variable-length feeds with virtualized lists (`FlashList` or `FlatList`) with stable `keyExtractor` and memoized row components; never nest vertical virtualized lists inside a vertical `ScrollView`.
- **Navigation & Auth Guarding**: In Expo Router, gate protected route groups (`(app)/_layout.tsx`) on resolved auth storage readiness so cold-start deep links preserve their intended destination after sign-in.
- **Anti-pattern — Expo Go Assumption**: Custom native modules or config-plugin permissions require a development build (`expo-dev-client` / prebuild); never claim native capability verification from a web preview or mismatched Expo Go binary.

## Workflow

1. Inspect app config, lockfile, navigation and native integration before choosing versions.
2. Verify the current SDK/runtime/peer matrix and implement the narrow feature or upgrade group.
3. Exercise loading/error states, keyboard, safe area and lifecycle transitions.
4. Test device integration in an actual development/release build; Expo Go may not contain the needed native module.
5. Run configured lint/type/tests, platform build and the primary device journey.

## Before returning

- [ ] Expo SDK / React Native / React peer matrix verified without forced incompatible versions
- [ ] Native module and `app.json` / `app.config.*` plugin changes reviewed against build fingerprint
- [ ] Safe areas, keyboard avoidance, permission denial states, and cold/warm deep links handled
- [ ] Tokens/secrets stored in secure platform storage and never hardcoded in JS bundle config
- [ ] Simulator/device vs JS-only test evidence reported transparently

## Sources

Versioned facts checked 2026-10-23; refresh authoritative sources before new installs/upgrades.
[Expo SDK matrix](https://docs.expo.dev/versions/latest/), [Expo upgrade](https://docs.expo.dev/workflow/upgrading-expo-sdk-walkthrough/), [React Native](https://reactnative.dev/docs/getting-started).

## Skills in scope

- mobile-design — native navigation patterns, safe-area insets, keyboard handling, and touch target sizing.
- mobile-performance — release-build frame timing, startup latency, and memory profiling on target devices.
- mobile-release — EAS / native code signing, runtime version alignment, and App Store / Play Store delivery.
- authentication-sessions — secure token storage, OAuth/passkey deep-link callbacks, and session rotation.
