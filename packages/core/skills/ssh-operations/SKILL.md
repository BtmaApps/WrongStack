---
name: ssh-operations
description: "Connect to and administer explicitly authorized hosts through OpenSSH with verified identity and bounded operations. Use when setting up SSH config, approved bastions, file transfer or a known remote maintenance task; a connection does not authorize work on additional hosts."
trigger: "Connect to and administer explicitly authorized hosts through OpenSSH with verified identity and bounded operations. Use when setting up SSH config, approved bastions, file transfer or a known remote maintenance task; a connection does not authorize work on additional hosts."
version: 1.0.2
required-capabilities: [filesystem.read]
required-tools: []
optional-capabilities: [filesystem.write, execution.shell, verification.run, web.research]
metadata:
  routing-group: operations
  domain: "operations"
---

# Ssh Operations

## Selection card
- Task: Establish verified SSH identities, sessions and transfers.
- Start: Identify the authorized target, current health and rollback boundary.
- Finish: apply the acceptance checks below; report observed results and unresolved constraints.

## Overview

SSH operations establish authenticated, host-key-verified remote execution and file transfer channels (`ssh`, `scp`, `sftp`, `rsync -e ssh`) to explicitly authorized hosts. Safe OpenSSH administration requires strict `known_hosts` verification, scoped key selection (`IdentitiesOnly yes`), non-interactive batch flags (`BatchMode=yes`, `ConnectTimeout`) so automated commands never hang on hidden password/passphrase prompts, and zero Tolerance for modifying `sshd_config` without a verified fallback session.

Checked upstream target 2026-10-23: OpenSSH portable 10.6p1. Distribution and Windows builds may carry different versions/backports; inspect installed support before changing host/client software.

## Rules

1. Confirm the explicitly authorized hostname/IP, username, port, and bastion (`ProxyJump`) before connecting; access to one host never implies authorization to pivot to sibling internal hosts.
2. Verify remote host keys against trusted `known_hosts` or out-of-band fingerprints (`ssh-keygen -lf`); **never** pass `-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null` to bypass a host-key mismatch warning without user verification.
3. Enforce strict key permissions (`0700` on `~/.ssh`, `0600` on private keys and `authorized_keys`), set `IdentitiesOnly yes` per host entry to prevent too-many-authentication-failures lockouts, and never print private keys (`id_ed25519` / PEM) to stdout or logs.
4. Keep `ForwardAgent no` by default (an compromised remote root user can hijack a forwarded local SSH agent socket) and bind any local port forwards to `127.0.0.1` (`-L 127.0.0.1:local:remote_host:remote_port`).
5. Use non-interactive connection options (`-o BatchMode=yes -o ConnectTimeout=10`) in scripts/automation and make remote commands idempotent before retrying after a dropped connection.
6. When editing `/etc/ssh/sshd_config`, always run `sshd -t` before reloading `sshd` and keep an existing authenticated session open until a fresh login test succeeds.

## Core Patterns & Pitfalls

- **Scoped `~/.ssh/config` Host Entry**:
  ```sshconfig
  Host prod-app
    HostName 203.0.113.10
    User deploy
    Port 22
    IdentityFile ~/.ssh/id_ed25519_prod
    IdentitiesOnly yes
    ForwardAgent no
    ServerAliveInterval 30
    ServerAliveCountMax 3
  ```
- **Safe File Transfers**: Stage uploaded files to a temporary path on the target host, verify checksum/permissions/ownership, and move (`mv`) into place atomically rather than overwriting live binaries or configs mid-transfer.
- **Anti-pattern — Locking Yourself Out via `sshd_config`**: Disabling `PasswordAuthentication` or changing `Port` / `AllowUsers` and restarting `sshd` without first verifying `sshd -t` and testing key-based login in a parallel terminal can permanently sever remote access.

## Workflow

1. Inspect local client version and effective config for the named target, redacting sensitive values.
2. Validate host identity and connect through the explicitly approved route/bastion.
3. Establish remote OS/user/work directory and operation preconditions.
4. Perform the requested bounded maintenance or transfer; validate paths and expected result.
5. Verify the outcome and close owned sessions/tunnels. Record any live state left running.

## Before returning

- [ ] Authorized target host, port, user, and bastion (`ProxyJump`) explicitly matched to task scope
- [ ] Host key verification (`StrictHostKeyChecking`) intact and `ForwardAgent` disabled unless required
- [ ] Private keys, passphrases, and secret payloads excluded from command lines and output logs
- [ ] Any `sshd_config` change validated with `sshd -t` and tested with a parallel login before closing session
- [ ] Temporary tunnels, control sockets (`ControlMaster`), and staging files cleaned up or documented

## Sources

Versioned facts checked 2026-10-23; refresh authoritative sources before new installs/upgrades.
[OpenSSH releases](https://www.openssh.com/releasenotes.html), [SSH config](https://man.openbsd.org/ssh_config).

## Skills in scope

- linux-service-ops — owned service configuration and lifecycle.
- remote-debugging — bounded evidence on the authorized host.
- vps-deploy — versioned deployment to the authorized server.
