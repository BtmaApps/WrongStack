# Android Delivery & Google Play Reference

Read the current [Android release guide](https://developer.android.com/studio/publish)
and Google Play target API requirements before building or submitting.

## 1. Identity, Versioning & SDK Matrix

1. Pin `applicationId` (immutable once published on Google Play), product flavor, build type (`release`), `versionName`, and monotonic integer `versionCode`. Every Play Console upload across all tracks must use a strictly higher `versionCode`.
2. Verify `targetSdk` against Google Play's current mandatory target API level policy, while keeping `minSdk` aligned with supported devices.
3. Coordinate Kotlin, Gradle (`gradle-wrapper.properties`), Android Gradle Plugin (AGP), and JDK toolchain versions before running `./gradlew bundleRelease`.

## 2. Permissions, Data Safety & R8 Shrinking

1. Audit merged manifest permissions (`./gradlew :app:processReleaseManifest` → `build/intermediates/merged_manifest/release/`): remove unintended transitive permissions (`READ_MEDIA_IMAGES`, `ACCESS_FINE_LOCATION`, `FOREGROUND_SERVICE_*`) that trigger Play Console policy blocks unless declared and justified.
2. When `isMinifyEnabled = true` and `isShrinkResources = true` are active (recommended for production), test all reflection/serialization models (Kotlinx Serialization, Gson, Moshi, Retrofit, JNI) under R8 rules (`proguard-rules.pro`).
3. Archive `mapping.txt` and native debug symbols (`native-debug-symbols.zip`) so Play Vitals ANR and crash stack traces deobfuscate cleanly.

## 3. Signing Lineage & Artifact Verification

1. Distinguish the **upload key** (used to sign `.aab` bundles uploaded to Play Console) from the **app signing key** managed by Play App Signing. Never commit `.jks`/`.keystore` files, `keystore.properties`, or Google Play Service Account JSON keys to source control.
2. Build the production Android App Bundle (`.aab` via `./gradlew bundleRelease` or `eas build --platform android`) for Play Store tracks, or a universal/split signed `.apk` (`bundletool build-apks --mode=universal`) for direct device/QA verification.
3. Inspect the signed artifact before upload:
   - Verify package name, `versionCode`, `minSdk`/`targetSdk`, and permissions with `apkanalyzer` or `bundletool dump manifest`.
   - Confirm signature scheme (v2/v3/v4) with `apksigner verify --print-certs`.
   - Verify Android App Links (`assetlinks.json` SHA-256 fingerprint must match the **Play App Signing** certificate in production, not only the local upload key).
4. Test upgrade-over-previous-release on a device (Room/SQLite migrations, EncryptedSharedPreferences/DataStore preservation, deep links, and process death recovery).

## 4. Track Promotion & Rollback Boundaries

- Report four states distinctly: **Signed `.aab`/`.apk` Built** → **Uploaded to Track** (`internal` / `closed` / `open` / `production`) → **Play Review Approved** → **Staged Rollout Active** (`userFraction`).
- Android devices cannot automatically downgrade an installed app to a lower `versionCode`; rolling back a bad production release requires halting the staged rollout or shipping a forward-incremented `versionCode` built from the known-good revision with backward-compatible local storage.
