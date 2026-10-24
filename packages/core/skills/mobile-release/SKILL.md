---
name: mobile-release
description: "Prepare and verify signed mobile releases, test-channel distribution and store submission artifacts. Use when configuring iOS/Android signing, build variants or release delivery; distinguish build success, upload, review approval and live availability."
trigger: "Prepare and verify signed mobile releases, test-channel distribution and store submission artifacts. Use when configuring iOS/Android signing, build variants or release delivery; distinguish build success, upload, review approval and live availability."
version: 1.0.2
required-capabilities: [filesystem.read]
required-tools: []
optional-capabilities: [filesystem.write, execution.shell, verification.run, web.research]
metadata:
  routing-group: mobile
  domain: "mobile"
---

# Mobile Release

## Selection card
- Task: Prepare mobile signing and app-store releases.
- Start: Identify the platform, screen, device and native integration boundary.
- Finish: apply the acceptance checks below; report observed results and unresolved constraints.

## Overview

Mobile release engineering bridges source revisions to signed, store-compliant binaries (`.ipa` for App Store Connect / TestFlight, `.aab` / `.apk` for Google Play tracks) and runtime-compatible OTA bundles. Because mobile clients cannot be rolled back instantaneously once installed on user devices, every release requires strict version monotonic increments, verified entitlements/privacy manifests, and separation between build completion and store live availability.

Refresh current Apple/Google submission requirements, framework SDK support and signing tooling before each release. Read [iOS delivery](references/ios.md) or [Android delivery](references/android.md) for the selected platform.

## Rules

1. Pin bundle/application id, marketing version, monotonic build number (`CFBundleVersion` / `versionCode`), environment, source revision and native runtime compatibility.
2. Keep signing certificates, provisioning profiles, keystores, and store API keys in the approved vault/CI mechanism; never write them into source or logs.
3. Build the exact production configuration and inspect entitlements/permissions, iOS Privacy Manifest (`PrivacyInfo.xcprivacy`), Android Data Safety / target SDK declarations, and production API endpoints.
4. Verify upgrade-over-previous-version behavior, universal/app links, push notification entitlements, and the primary user journey in the signed build.
5. OTA updates (e.g., EAS Update) must match the supported `runtimeVersion` / native binary fingerprint and store policy; they cannot add or modify native code.
6. Publish or submit only within the authorized release task; a local or CI archive build does not authorize a store upload or production rollout.

## Core Patterns & Pitfalls

- **Monotonic Build Numbers & Runtime Fingerprints**: Increment `CFBundleVersion` (iOS) and `versionCode` (Android) monotonically per upload, and tie OTA channels to a deterministic `runtimeVersion` so incompatible JS bundles never ship to older native shells.
- **Symbolication & Crash Mapping**: Retain or upload dSYMs (iOS), R8/ProGuard mapping files (Android), and JS source maps alongside each build identifier so production crashes remain decodable.
- **Anti-pattern — Debug Endpoints or Test Keys in Release Variants**: Verify that release build flavors strip development menus, localhost fallbacks, and sandbox billing/API keys before signing.

## Workflow

1. Inspect the platform release configuration and current account/environment boundary.
2. Check SDK/store requirements and prepare deterministic version/signing inputs.
3. Build, inspect and test the signed artifact through the appropriate platform path.
4. Use the requested test/submission channel and record actual upload/review state.
5. Verify distribution availability separately and preserve rollback/recovery information.

## Before returning

- [ ] Application/bundle ID, marketing version, build number, and git SHA recorded
- [ ] Signing credentials, keystores, and store tokens kept outside source and terminal output
- [ ] Entitlements, permission purpose strings, privacy manifest, and target SDK verified
- [ ] Signed release artifact exercised (including upgrade path and deep links where applicable) and debug symbols archived
- [ ] Build completion, TestFlight/internal-track upload, store review, and live rollout states reported separately

## Sources

Versioned facts checked 2026-10-23; refresh authoritative sources before new installs/upgrades.
[Expo production builds](https://docs.expo.dev/build/introduction/), [App Store submission](https://developer.apple.com/app-store/submitting/), [Android release](https://developer.android.com/studio/publish).

## Skills in scope

- react-native-expo — EAS Build profiles, `runtimeVersion` policies, and config plugin native generation.
- flutter-mobile — Flutter release flavors (`--release`, `--obfuscate`, `--split-debug-info`) and platform runner configuration.
- ci-cd — automated signing workflows, artifact provenance, and release approval gates.
- release-rollback — staged store rollout halts, compatible API versioning, and OTA rollback boundaries.
