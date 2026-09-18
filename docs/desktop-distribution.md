# Desktop distribution

The Bun CLI and Electron Desktop are separate release assets. Electron includes
Chromium and its own Node runtime; users of the packaged Desktop do not install
Node, npm, or Electron separately.

The `Desktop` workflow builds Windows x64 (setup and portable executables), macOS
x64/arm64 (DMG and ZIP), and Linux x64 (AppImage and deb). The release workflow
attaches these files and `DESKTOP-SHA256SUMS` to the same GitHub release as the CLI.
Desktop publishing does not depend on npm publishing, and Desktop packaging
failures do not block the CLI release. Builds currently have no signing credentials.

Download a matching `wrongstack-desktop-*` asset from
[GitHub Releases](https://github.com/WrongStack/WrongStack/releases).
Install the Windows setup package or move the macOS app to Applications, then run
`wstack --desktop`. For Linux AppImage, save it as
`~/.wrongstack/desktop/WrongStack.AppImage` and `chmod +x` that file.

For a portable executable or a custom installation directory, set an absolute path:

```powershell
$env:WRONGSTACK_DESKTOP_EXECUTABLE = 'D:\Apps\WrongStack\WrongStack.exe'
wstack --desktop
```

On macOS, the override points inside the app to
`WrongStack.app/Contents/MacOS/WrongStack`. On Windows, a portable release asset
can also be placed at `%USERPROFILE%\.wrongstack\desktop\WrongStack.exe`.
The CLI does not download or update Desktop automatically. Install a new release
asset to update it. Source/npm installations remain a compatibility fallback.

The Desktop sidebar keeps project actions visible and shows runtime status and
open session counts. Its footer provides reload, reveal-folder, and open-in-browser
shortcuts. Collapsing the sidebar retains Open Project and Settings. Stopped or
failed projects can be reopened directly; connection errors expose a reload action
in the sidebar, outside the embedded WebUI. The welcome screen lists recent projects.

For local packaging, run `node scripts/package-desktop.mjs --publish never`.
The script builds the workspace dependency closure, deploys local packages, and
packages Electron; output is under `apps/desktop/.package-stage/release`.
Run `node scripts/smoke-desktop.mjs --window` to verify packaged dependencies,
assets, a real PTY process, and window startup using an isolated profile and the
host platform's bundled Electron runtime. Linux needs a display; CI uses
`xvfb-run -a`. CI runs this before uploading.
Build-time dependencies still come from the package registry. This migration
removes the end user's registry dependency, not the build system's dependency.

Native module rebuilds are disabled; Windows x64 passes the packaged PTY smoke
using the shipped prebuild. Other platforms must pass their own smoke before
release. This is a local shell test, not a full agent/provider integration test.
