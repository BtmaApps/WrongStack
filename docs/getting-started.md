# First session and daily workflow

## Launch from the project

Use the [standalone installation/update guide](cli-reference.md#updating) for
distribution setup, then run `wstack` in the repository you want to work on.
Interactive startup offers the launch menu and account/model selection.

```bash
wstack version
wstack auth
wstack --tui
```

`wstack auth` configures provider/account credentials and a default model.
The deprecated `wstack init` only prints migration guidance; `/init` in a
session generates project context, while `wstack project init` creates the
repository's stable project identity.

| Surface | Start |
|---|---|
| Terminal TUI | `wstack --tui` |
| Project browser UI | `wstack --webui` |
| Lightweight browser chat | `wstack --simpleui` |
| Desktop shell | `wstack --desktop` |
| HQ command center | `wstack --hq` |

The browser launch prints its actual URL; use that URL/token rather than
assuming the default port was free. For an SSH-hosted project, use
[wstack remote](subcommands/remote.md).

## Make the first task concrete

Give the agent the intended result, relevant paths and acceptance condition:
“Read the CSV import code, add rejection for duplicate headers, and run the
existing import tests.” Inspect the plan/tool results and answer any permission
or missing-input prompts. For explicit per-call approval behavior, launch with
`--no-yolo` or use `/yolo off`; startup/profile choices can otherwise retain
YOLO. [/permissions](slash/permissions.md) explains the active policy.

Start with `/tools`, `/context`, `/help` and
[tool workflows](tools/README.md). Use `/effort` to inspect reasoning support
and `/profile` to switch configuration. A tool's discovery or planned command
is not evidence that execution or verification succeeded.

## Continue and track

`wstack sessions` lists saved sessions; `wstack --resume <id>` resumes one.
Use [session commands](slash/session.md) for in-session save/load behavior.
For executable phase work, `/goal start <goal>` creates a goal and `/goals`
tracks project runs; task progress remains separate from final verification.
Use `/flow` in the TUI for bounded cross-board work visibility.

For a fault, begin with `wstack diag` or `wstack doctor --daemons`. Check the
reported provider/service boundary, then use [troubleshooting](troubleshooting.md).
See [configuration layers](configuration.md) before changing a persisted file.

For source development, use [architecture](architecture.md) and
[package owners](architecture/package-owners.md). The public client API is
[documented separately](client-api.md).
