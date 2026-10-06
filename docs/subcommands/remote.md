# `wstack remote` — SSH-hosted WebUI

Run WrongStack in a remote project and use its WebUI through a local SSH tunnel.
The agent, files, commands and project services run remotely. Your local
provider/account configuration is not uploaded.

```bash
wstack remote user@host:/srv/project --open
wstack remote ssh://user@host:2222/srv/project --port 3456
```

System `ssh` uses your SSH config, agent and known hosts. A remote build is
selected for the host's platform: an explicit binary, a compatible current
standalone build, or a verified release asset. Configure providers in the
remote WebUI when first connecting.

| Option | Meaning |
|---|---|
| `--port <n>` | Preferred local tunnel port; default 3456, with a free-port fallback |
| `--open` | Open the local WebUI URL in a browser |
| `--keep` | Leave the remote runtime running after disconnect |
| `--ssh-config <file>` | Pass a selected configuration to SSH |
| `--remote-binary <file>` | Upload/use an explicit build instead of release selection |

Interrupting the command closes the local connection; `--keep` changes remote
runtime cleanup. The handler returns 2 for a missing/invalid target or an
invalid TCP port, and 1 for an operation failure. Check target syntax, SSH
access and the printed connection error before changing provider settings.
Using `wstack --remote <target>` follows the same remote startup path.

Sources: [`remote.ts`](../../packages/cli/src/subcommands/handlers/remote.ts),
[`remote-session.ts`](../../packages/cli/src/remote/remote-session.ts),
[`remote-target.ts`](../../packages/cli/src/remote/remote-target.ts).
See [WebUI](../webui.md) and [provider sign-in](../oauth-signin.md).
