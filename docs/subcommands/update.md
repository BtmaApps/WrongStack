# `wstack update` — Self-Update

## What it does

Updates exclusively from GitHub Releases. A legacy npm, pnpm, yarn or Bun
installation prints a warning and migrates to the standalone binary, even when
the package version is already current. Package-manager updates are disabled.

## Behavior

```
wstack update
  → Fetch latest GitHub Release
  → Standalone: if newer, verify and replace the executable in place
  → Legacy package: warn, run the bundled platform installer
  → Verify SHA-256, install the binary and check that it runs
  → Set up PATH, then uninstall old global wrongstack / @wrongstack/cli packages
  → If uninstall fails: report incomplete migration and the commands to retry
  → If error: "Update check failed — check your internet connection"
```

Use `wstack update --check-only` (or `-c`) to report versions and migration
guidance without installing or uninstalling anything.

Legacy options `--pm`, `--package-manager`, `--npm`, `--pnpm`, `--yarn`, `--bun`,
`--allow-scripts` and `--lifecycle-scripts` are ignored with a warning. They
cannot enable a package-manager update.

```text
wstack update
wstack update --check-only
```

Open a new terminal after migration so it picks up the binary's PATH. On Windows,
other running WrongStack WebUI, Desktop or background processes can lock old
package files. Stop them and retry the printed uninstall commands if needed.

Manual binary installation:

```bash
curl -fsSL https://wrongstack.com/install.sh | sh
```

On Windows: `irm https://wrongstack.com/install.ps1 | iex`.

## Code reference

- `packages/cli/src/subcommands/handlers/update.ts`
