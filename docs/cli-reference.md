# CLI Reference

Full reference for WrongStack's command-line surface: launch flags, subcommands,
and the `wstack update` self-updater. For slash commands (typed inside a running
session) see [`docs/slash/`](slash/). For every `wstack <subcommand>` see also
[`docs/subcommands/`](subcommands/).

> `wrongstack` and `wstack` are the same binary. Examples below use whichever is
> shorter; they are interchangeable.

---

## Launch flags

| Flag | Effect |
|------|--------|
| `--tui` | Launch the Ink/React full-screen TUI (lazy-loaded). |
| `--webui` | Launch the standalone browser UI + WebSocket bridge. |
| `--simpleui` | Launch the minimal SimpleUI chat surface. |
| `--desktop` | Launch the Electron desktop shell hosting a token-gated local WebUI. |
| `--hq` | Launch the cross-machine HQ Command Center. |
| `--no-menu` | Skip the five-option launch menu on a TTY and go straight to the REPL. |
| `--yolo` | Auto-approve tool calls within the active permission policy (never overrides trust-denies). |
| `--director` | Enable multi-agent Director orchestration. |
| `--provider <id>` / `--model <id>` | Skip the startup picker and pin a provider/model. |
| `-p, --print <query>` | Single-shot: run one query non-interactively and exit. |
| `--resume [id]` | Resume a saved session (prompts for one when omitted). |
| `--token-saving-mode` | Trim the tool surface and prompt to reduce token cost. |
| `--system-pro` | Use `system-pro.md` instead of `system.md` for the baseline system prompt in this launch. Equivalent to `--system-prompt pro`. |
| `--system-lite` | Use the compact `system-lite.md` baseline for this launch. Equivalent to `--system-prompt lite`. |
| `--system-prompt default\|lite\|pro` | Select the baseline system prompt variant for this launch. `default` uses `system.md`; `lite` uses `system-lite.md`; `pro` uses `system-pro.md`, including profile/project instruction overrides. |
Run `wstack --help` for the authoritative, version-specific flag list.

---

## Subcommands

`wstack <subcommand> [args]`. Common ones:

| Subcommand | Purpose |
|------------|---------|
| `wstack init` | Scaffold project-level `.wrongstack/` config and identity. |
| `wstack auth` | Interactive auth menu (API keys + subscription OAuth sign-in). |
| `wstack sessions` | List, inspect, and resume saved sessions. |
| `wstack config` | Inspect and edit configuration. |
| `wstack models` | Browse the provider/model catalog (paginated). |
| `wstack tools` | List built-in tools. |
| `wstack skills` | List and manage bundled skills. |
| `wstack desktop` | Launch the Electron desktop shell. |
| `wstack project id\|init\|rekey` | Manage the repository-stable `proj_<ULID>` identity. |
| `wstack update` | Update the CLI in place — see below. |
| `wstack version` | Print the installed version. |
| `wstack help` | Print top-level help. |

See [`docs/subcommands/`](subcommands/) for the full per-subcommand reference.

---

## Updating

### One-liner

WrongStack ships as a standalone binary through GitHub Releases:

```bash
# macOS / Linux — install (or reinstall) the latest release
curl -fsSL https://github.com/WrongStack/WrongStack/releases/latest/download/install.sh | sh
```

```powershell
# Windows
irm https://github.com/WrongStack/WrongStack/releases/latest/download/install.ps1 | iex
```

Then keep it current from inside the tool with `wstack update`.

The npm packages are legacy. The installer uninstalls old `wrongstack` /
`@wrongstack/cli` globals from npm, pnpm, yarn or bun (asking first on a
terminal) so they cannot shadow the binary.

### `wstack update`

`wstack update` downloads the latest GitHub release for your platform, verifies
it against the release `SHA256SUMS` and swaps the executable in place.

The `--pm` and `--allow-scripts` flags only apply to a legacy npm install,
where `wstack update` still reinstalls through the detected package manager.

```
Usage: wstack update [--check-only] [--pm <manager>] [--allow-scripts]
```

| Flag | Effect |
|------|--------|
| `--check-only`, `-c` | Report whether a newer version exists without installing anything. |
| `--pm <manager>` | Force a specific package manager (`npm`, `pnpm`, `yarn`, or `bun`) instead of auto-detecting. The bare `--npm`, `--pnpm`, `--yarn`, and `--bun` shortcuts are accepted as equivalents of `--pm <name>`. |
| `--allow-scripts`, `--lifecycle-scripts` | Run package lifecycle scripts during the update (off by default). |

Examples:

```bash
wstack update                         # download + verify the latest release
wstack update --check-only            # is there a newer release?
wstack update --pm pnpm               # legacy npm install only: force pnpm
wstack update --pnpm                  # equivalent shortcut for `--pm pnpm`
wstack update --lifecycle-scripts     # equivalent shortcut for `--allow-scripts`
```

You can always update manually by re-running the install one-liner.
