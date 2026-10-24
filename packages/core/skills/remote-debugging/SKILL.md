---
name: remote-debugging
description: "Diagnose a reported application failure on explicitly authorized remote hosts using bounded logs and runtime evidence. Use when local behavior differs from a known server or deployment; start read-only and keep diagnosis separate from disruptive remediation."
trigger: "Diagnose a reported application failure on explicitly authorized remote hosts using bounded logs and runtime evidence. Use when local behavior differs from a known server or deployment; start read-only and keep diagnosis separate from disruptive remediation."
version: 1.0.2
required-capabilities: [filesystem.read]
required-tools: []
optional-capabilities: [filesystem.write, execution.shell, verification.run, web.research]
metadata:
  routing-group: operations
  domain: "operations"
---

# Remote Debugging

## Selection card
- Task: Diagnose remote processes and networking over SSH.
- Start: Identify the authorized target, current health and rollback boundary.
- Finish: apply the acceptance checks below; report observed results and unresolved constraints.

## Overview

Remote debugging investigates production or staging failures on explicitly authorized hosts by starting strictly read-only: verifying the exact running binary/image revision, correlating time-bounded logs (`journalctl --since ... --until ...`, `docker logs --since`) with host resource saturation (disk space/inodes, OOM kills, file descriptors, socket state), and forming a proven root-cause hypothesis before touching any live process.

Verify the actual runtime/package/container versions and source identity on the target; current host facts outrank assumptions from local builds.

## Rules

1. Pin the authorized hostname, target service/container, failing symptom, and UTC time window before executing remote commands.
2. Start with non-disruptive, read-only inspection: verify running PID/uptime, deployed git SHA or container digest, listening ports (`ss -tulnp`), and non-secret configuration state.
3. Bound every log and command query with explicit time windows and line caps (`--since`, `--lines 200`); never run unbounded `cat` on multi-gigabyte logs or dump full process environments (`printenv`, `/proc/<pid>/environ`) that expose live secrets.
4. Check host-level failure modes systematically alongside application logs: disk capacity (`df -h`), inode exhaustion (`df -i`), kernel OOM killer events (`dmesg -T | grep -iE 'oom|killed process'`), memory/swap pressure (`free -m`), open file limits, and upstream DNS/TLS connectivity.
5. Keep diagnosis separate from remediation: do not restart services, edit live source files in place, or attach high-overhead debuggers/strace on production traffic without explicit authorization.
6. Remove any authorized temporary diagnostic artifacts before returning and never probe unapproved hosts or credentials.

## Core Patterns & Pitfalls

- **Read-Only Triage Checklist**:
  1. Identity & Uptime: `systemctl status <unit>` or `docker ps` + image/commit hash (did it recently restart or deploy drifted code?).
  2. Host Exhaustion: `df -h`, `df -i`, `free -m`, `dmesg -T | tail -n 50` (silent disk-full or kernel OOM kill?).
  3. Bounded Service Logs: `journalctl -u <unit> --since "15 min ago" -n 200 --no-pager`.
  4. Network & Sockets: `ss -tulnp` and local health probe (`curl -sS -D - http://127.0.0.1:<port>/healthz -o /dev/null`).
- **Anti-pattern — Dumping `env` or Editing Live Prod Files**: Running `env` / `cat .env` prints production secrets into terminal transcripts, and editing files directly on a remote server creates untracked drift that the next deployment will wipe out.

## Workflow

1. Connect through the approved SSH/observability surface.
2. Read service status, focused logs and relevant deployment/config differences.
3. Form one hypothesis and run the least disruptive bounded check.
4. Apply only requested/authorized remediation and verify the actual remote behavior.
5. Remove owned temporary instrumentation and state any remaining live risk/uncertainty.

## Before returning

- [ ] Authorized host, service/container identity, deployed revision, and UTC symptom window recorded
- [ ] Diagnostics performed with bounded, read-only commands (`--since`, `--lines`) and zero secret dumps
- [ ] Host-level signals (disk/inodes, OOM/memory, sockets, DNS/TLS) checked alongside application logs
- [ ] Root cause backed by concrete remote evidence and separated from authorized remediation
- [ ] Any temporary diagnostic files or port forwards cleaned up

## Sources

Versioned facts checked 2026-10-23; refresh authoritative sources before new installs/upgrades.
[systemd journal](https://www.freedesktop.org/software/systemd/man/latest/journalctl.html), [OpenTelemetry](https://opentelemetry.io/docs/).

## Skills in scope

- ssh-operations — connect to and administer explicitly authorized hosts through OpenSSH with verified identity and bounded operations.
- linux-service-ops — configure and troubleshoot application services on an authorized Linux host with explicit service ownership.
- debugging — reproduce and fix the localized defect in the repository with a regression test.
- incident-response — diagnose and recover an owned service incident with bounded changes, timeline evidence and verified health. Use during outages, bad deployments or data/service degradation; preserve evidence and separate mitigation from root-cause repair.
