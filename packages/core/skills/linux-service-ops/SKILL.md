---
name: linux-service-ops
description: "Configure and troubleshoot application services on an authorized Linux host with explicit service ownership. Use when managing systemd units, startup, logs, users, permissions or service resources; preserve the administrator existing distro configuration."
trigger: "Configure and troubleshoot application services on an authorized Linux host with explicit service ownership. Use when managing systemd units, startup, logs, users, permissions or service resources; preserve the administrator existing distro configuration."
version: 1.0.2
required-capabilities: [filesystem.read]
required-tools: []
optional-capabilities: [filesystem.write, execution.shell, verification.run, web.research]
metadata:
  routing-group: operations
  domain: "operations"
paths: ["*.{service,timer,socket}"]
---

# Linux Service Ops

## Selection card
- Task: Operate Linux services, journals and resource limits.
- Start: Identify the authorized target, current health and rollback boundary.
- Finish: apply the acceptance checks below; report observed results and unresolved constraints.

## Overview

Linux service administration manages daemon lifecycles, drop-in overrides (`/etc/systemd/system/<unit>.service.d/*.conf`), structured journal logs (`journalctl`), dedicated unprivileged service accounts, and cgroup resource/sandboxing directives through `systemd`. Safe host service operations require inspecting merged unit definitions (`systemctl cat`), validating syntax (`systemd-analyze verify`) before restarting, and never disrupting active SSH/management paths.

Checked upstream systemd release: 262.1 (2026-10-23). Use the distro-supported systemd package and its actual unit directives; upstream latest does not justify replacing the host OS service manager.

## Rules

1. Inspect the exact unit name, effective merged config (`systemctl cat <unit>`), active PID/cgroup (`systemctl status <unit>`), listening sockets (`ss -tulnp`), and owning UNIX user before editing anything.
2. Distinguish `daemon-reload` (re-reads unit files on disk without restarting processes), `reload` (sends reload signal/command to running service), `restart` (stops and starts the process), and `enable`/`disable` (boot persistence).
3. Customize vendor units via `/etc/systemd/system/<unit>.d/override.conf` rather than editing package-managed files under `/lib/systemd/system/` or `/usr/lib/systemd/system/` that OS upgrades will overwrite.
4. Load runtime secrets via root-owned `EnvironmentFile=` (`0600`) or `LoadCredential=` / `SetCredentialEncrypted=` rather than inline `Environment=` literals or command-line arguments visible in `ps aux` and `systemctl show`.
5. Validate unit syntax (`systemd-analyze verify`) and remember that `ExecStart=` is **not** a full POSIX shell (`|`, `>`, `&&`, `$VAR` expansion work differently unless explicitly invoking `/bin/sh -c`, and clearing `ExecStart=` in a drop-in requires an empty `ExecStart=` line before the replacement).
6. Match sandboxing directives (`User=`, `WorkingDirectory=`, `StateDirectory=`, `ProtectSystem=strict`, `ReadWritePaths=`, `NoNewPrivileges=yes`, `LimitNOFILE=`) to the application's actual writable directories and `TimeoutStopSec=` drain window.

## Core Patterns & Pitfalls

- **Drop-In `ExecStart` Override Rule**: In a systemd `.d/*.conf` drop-in, `ExecStart=` is additive; to replace the vendor `ExecStart=`, you **must** write an empty reset line first:
  ```ini
  [Service]
  ExecStart=
  ExecStart=/usr/local/bin/my-service --config /etc/my-service/config.toml
  ```
- **Diagnosing `status=203/EXEC`, `217/USER`, `226/NAMESPACE`**:
  - `203/EXEC`: missing binary, relative path in `ExecStart`, missing `+x` bit, missing shebang, or SELinux/AppArmor denial.
  - `217/USER`: specified `User=`/`Group=` does not exist on the host.
  - `226/NAMESPACE`: path specified in `ReadWritePaths=` / `WorkingDirectory=` does not exist when systemd sets up the mount namespace.
- **Anti-pattern — Putting Secrets on `ExecStart` CLI Flags**: Passing `--db-password=...` in `ExecStart` exposes the secret to every unprivileged user on the host via `/proc/<pid>/cmdline` and `ps`.

## Workflow

1. Read the target unit/effective overrides, relevant journal window and process status.
2. Identify the narrow configuration or application cause; prepare an owned drop-in or source fix.
3. Validate, reload definitions where needed and perform the authorized service transition.
4. Confirm new process/version, readiness, logs and clean stop/restart.
5. Report changes, downtime/recovery boundary and persistent enablement state.

## Before returning

- [ ] Target unit, merged overrides (`systemctl cat`), PID, and listening socket verified
- [ ] Customizations placed in `/etc/systemd/system/` or `.d/*.conf` drop-ins with `daemon-reload` run
- [ ] Unit syntax, `ExecStart` absolute paths/permissions, and `ReadWritePaths`/`StateDirectory` verified
- [ ] Secrets loaded via restricted `EnvironmentFile=` / `LoadCredential=` and redacted from `journalctl` output
- [ ] Active running PID, post-transition journal logs, and boot `is-enabled` state confirmed

## Sources

Versioned facts checked 2026-10-23; refresh authoritative sources before new installs/upgrades.
[systemd service contract](https://www.freedesktop.org/software/systemd/man/latest/systemd.service.html), [systemd releases](https://github.com/systemd/systemd/releases).

## Skills in scope

- ssh-operations — verified authorized remote connection.
- remote-debugging — bounded evidence on the authorized host.
- observability — runtime signals and correlation.
- release-rollback — version promotion and recovery compatibility.
