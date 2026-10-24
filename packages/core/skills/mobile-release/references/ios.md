# iOS Delivery & App Store Connect Reference

Read the current [App Store submission requirements](https://developer.apple.com/app-store/submitting/)
and selected framework native build requirements before signing or submission.

## 1. Identity & Versioning Contract

1. Pin `PRODUCT_BUNDLE_IDENTIFIER`, Apple Developer `DEVELOPMENT_TEAM`, Xcode scheme, and `Release` build configuration.
2. Verify `CFBundleShortVersionString` (marketing version, e.g. `2.4.0`) and `CFBundleVersion` (build number, e.g. `20401`). App Store Connect rejects any upload whose `CFBundleVersion` is not strictly greater than previously uploaded builds for that train.
3. Confirm Xcode / iOS SDK minimum requirement enforced by Apple for new submissions and updates, while keeping `IPHONEOS_DEPLOYMENT_TARGET` aligned with the app's supported OS floor.

## 2. Entitlements, Privacy Manifest & Capabilities

1. Audit `*.entitlements`: Sign in with Apple, Associated Domains (`applinks:`), Push Notifications (`aps-environment: production`), App Groups, and Keychain Access Groups must match the provisioning profile.
2. Verify `PrivacyInfo.xcprivacy` (Privacy Manifest) for the app and embedded third-party SDKs:
   - Required Reason APIs (`NSPrivacyAccessedAPITypes`: UserDefaults, File Timestamp, System Boot Time, Disk Space).
   - Tracking domains (`NSPrivacyTracking`, `NSPrivacyTrackingDomains`) and collected data categories (`NSPrivacyCollectedDataTypes`).
3. Ensure every requested hardware/OS permission (`NSCameraUsageDescription`, `NSLocationWhenInUseUsageDescription`, `NSPhotoLibraryUsageDescription`, etc.) has a specific, user-facing purpose string in `Info.plist`—empty or placeholder strings trigger immediate automated rejection.

## 3. Signing, Archiving & Artifact Verification

1. Keep `.p12` distribution certificates, `.mobileprovision` profiles, and App Store Connect API keys (`AuthKey_<KeyID>.p8`, Issuer ID, Key ID) inside the CI keychain or EAS secret store; never write them into git or build logs.
2. Build and archive the exact `Release` configuration (`xcodebuild archive` or `eas build --platform ios --profile production`) and export the `.ipa` with an explicit `ExportOptions.plist` (`method: app-store-connect` or `ad-hoc`).
3. Archive `.dSYM` symbol bundles alongside the build so crash reports from TestFlight and production remain symbolicated.
4. Test the signed release build on a physical device or TestFlight internal track:
   - Upgrade over the previous production version (Keychain & SQLite/CoreData migration).
   - Universal Links (`apple-app-site-association`), OAuth/Passkey callbacks, and push notification token registration.
   - Export compliance declaration (`ITSAppUsesNonExemptEncryption` in `Info.plist`) so TestFlight builds do not block on manual encryption prompts.

## 4. Upload vs Review vs Live Availability

- Distinguish four separate states in release reports:
  1. **Signed Archive Built** (`.xcarchive` / `.ipa` produced locally or in CI).
  2. **Uploaded & Processed** (`xcrun altool` / `Transporter` / Fastlane `deliver` / `eas submit` accepted and App Store Connect finished binary processing).
  3. **TestFlight / App Review Approved** (beta or production review passed).
  4. **Live on App Store** (phased or manual release active for end users).
- Native code, entitlement, or `Info.plist` changes **always** require a new signed binary upload; OTA JavaScript/asset bundles cannot add native modules or alter entitlements.
