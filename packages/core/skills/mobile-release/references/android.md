# Android delivery

Read the current [Android release guide](https://developer.android.com/studio/publish)
and Google Play submission requirements rather than copying an old SDK target.

1. Identify application id, flavor/build type, signing lineage, versionCode/versionName.
2. Verify current SDK/AGP/JDK/Gradle compatibility, manifest permissions and production endpoints.
3. Keep keystore/upload credentials in the approved secret mechanism.
4. Build the requested signed bundle/APK and inspect its package/permission metadata.
5. Test fresh install and upgrade with existing data, deep links, process recreation and offline behavior.
6. Use only the authorized internal/closed/open/production track. Record upload,
   processing, review and actual user availability separately.
7. Preserve key continuity and data/version compatibility; changing signing keys
   or package identity is not an ordinary rollback.

Framework minimum OS support and store target requirements are separate facts.
