# iOS delivery

Read the current [App Store requirements](https://developer.apple.com/app-store/submitting/)
and selected framework native build requirements before signing or submission.

1. Identify bundle id, team, scheme, configuration, build/version and environment.
2. Review entitlements, privacy declarations, permission copy and embedded SDK behavior.
3. Use the approved certificate/profile/signing mechanism; do not export credentials to logs.
4. Archive the production configuration and inspect the signed artifact metadata.
5. Test install/upgrade, login/deep link, background/resume and the primary user task.
6. Upload only to the authorized TestFlight/App Store target. Record processing,
   testing, review and live availability separately.
7. Native runtime changes cannot be delivered merely as JS/asset OTA updates.

An Xcode compile or simulator launch is not signed-device/store delivery proof.
