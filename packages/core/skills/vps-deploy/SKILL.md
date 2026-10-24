---
name: vps-deploy
description: "Deploy an owned application to an explicitly authorized VPS with versioned artifacts, service identity and live health evidence. Use when publishing or repairing a known server deployment; preserve existing services and separate local preparation from remote execution."
trigger: "Deploy an owned application to an explicitly authorized VPS with versioned artifacts, service identity and live health evidence. Use when publishing or repairing a known server deployment; preserve existing services and separate local preparation from remote execution."
version: 1.0.2
required-capabilities: [filesystem.read]
required-tools: []
optional-capabilities: [filesystem.write, execution.shell, verification.run, web.research]
metadata:
  routing-group: operations
  domain: "deployment"
---

# Vps Deploy

## Selection card
- Task: Release an application on an existing VPS.
- Start: Identify the authorized target, current health and rollback boundary.
- Finish: apply the acceptance checks below; report observed results and unresolved constraints.

## Overview

VPS deployment publishes an application to an explicitly authorized virtual private server using immutable versioned release directories (`/srv/<app>/releases/<timestamp-sha>` + atomic `ln -sfn` symlink switch) or pinned container digests, isolated runtime users, and verified local-to-public health checks. Safe VPS operations preserve co-located services on the host and never mutate live code in place via `git pull` + `npm build` directly inside the serving directory.

Resolve current stable application/runtime targets through tech-stack, then verify host OS/architecture and supported packages. Do not replace an entire host toolchain merely because upstream released a newer version.

## Rules

1. Pin the authorized host, deploy user, target application directory, systemd unit or Compose stack, upstream localhost port, and public domain before transferring files.
2. Build and verify the release artifact before promotion (either in CI/local build matching host OS/arch or inside a new isolated `/srv/<app>/releases/<id>` directory); keep persistent data (`shared/`, uploads, SQLite files, `.env`) outside ephemeral release directories.
3. Switch active releases atomically (`ln -sfn /srv/<app>/releases/<new> /srv/<app>/current-tmp && mv -Tf /srv/<app>/current-tmp /srv/<app>/current` or pinned image digest rollout) and retain the previous `N` releases for instant rollback.
4. Verify that the application binds to `127.0.0.1:<port>` (when fronted by Nginx/Caddy/Traefik), runs under its dedicated non-root user, and passes a local readiness check (`curl -sf http://127.0.0.1:<port>/healthz`) before restarting/reloading traffic.
5. Run backward-compatible database migrations and verify sufficient disk space (`df -h`) and memory (`free -m`) on the VPS before cutting traffic over.
6. Separate local deployment preparation (scripts, systemd units, proxy configs) from live remote execution; execute remote changes only within explicit task authorization.

## Core Patterns & Pitfalls

- **Atomic Release Directory Layout**:
  - `/srv/app/releases/<utc-sha>/` — immutable built code and locked production dependencies
  - `/srv/app/shared/` — `.env` (`0600`), persistent storage, sockets/PIDs
  - `/srv/app/current` → atomic symlink pointing to the active release directory
- **Co-Located Host Safety**: A VPS often hosts multiple sites, databases, or cron jobs. Inspect existing listening ports (`ss -tulnp`), active systemd units, and Nginx/Caddy vhosts before choosing ports or reloading shared services.
- **Anti-pattern — Building In-Place Inside `/var/www/app`**: Running `git pull && bun install && bun run build` directly inside the live serving directory serves half-built assets, exhausts small VPS RAM/CPU during compilation, and leaves the server broken if the build fails midway.

## Workflow

1. Inspect existing deployment/service and capture current release/health.
2. Verify latest stable targets, build and run the artifact locally or in an isolated equivalent.
3. Transfer/pull the versioned artifact to the known authorized target and validate ownership/config.
4. Start/health-check the new release, then perform the authorized promotion.
5. Verify live user path, service version and logs; retain prior release for the defined rollback window.

## Before returning

- [ ] Authorized VPS host, service unit/stack, port binding, and prior release revision recorded
- [ ] Artifact built and staged into a versioned release path or pinned digest without in-place live mutation
- [ ] Persistent state/secrets (`shared/.env`, data directories) preserved with strict ownership and permissions
- [ ] Local upstream health (`127.0.0.1:<port>`), public HTTPS route, and post-cutover logs verified
- [ ] Previous release retained and exact rollback command documented

## Sources

Versioned facts checked 2026-10-23; refresh authoritative sources before new installs/upgrades.
[systemd services](https://www.freedesktop.org/software/systemd/man/latest/systemd.service.html), [Docker production](https://docs.docker.com/compose/how-tos/production/).

## Skills in scope

- ssh-operations — connect to and administer explicitly authorized hosts through OpenSSH with verified identity and bounded operations.
- linux-service-ops — configure and troubleshoot application services on an authorized Linux host with explicit service ownership.
- reverse-proxy-tls — configure and troubleshoot reverse proxies, HTTPS, domains and upstream routing for an authorized application.
- release-rollback — plan and execute authorized release promotion or rollback with exact artifact and data compatibility.
- backup-recovery — design and verify backups and restoration for owned databases, files and application state.
