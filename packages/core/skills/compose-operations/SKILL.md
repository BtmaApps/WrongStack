---
name: compose-operations
description: "Operate and evolve multi-service Docker Compose environments with explicit networks, volumes and environment boundaries. Use when wiring services, health dependencies or production overrides; use docker-deploy for image construction."
trigger: "Operate and evolve multi-service Docker Compose environments with explicit networks, volumes and environment boundaries. Use when wiring services, health dependencies or production overrides; use docker-deploy for image construction."
version: 1.0.2
required-capabilities: [filesystem.read]
required-tools: []
optional-capabilities: [filesystem.write, execution.shell, verification.run, web.research]
metadata:
  routing-group: operations
  domain: "containers"
paths: ["docker-compose*.{yml,yaml}", "compose.{yml,yaml}", "compose.*.{yml,yaml}"]
---

# Compose Operations

## Selection card
- Task: Operate multi-service Docker Compose dependencies.
- Start: Identify the authorized target, current health and rollback boundary.
- Finish: apply the acceptance checks below; report observed results and unresolved constraints.

## Overview

Docker Compose orchestrates multi-service local and single-host environments through declarative service definitions (`compose.yaml`), readiness-gated dependency graphs (`depends_on` with `condition: service_healthy` / `service_completed_successfully`), isolated bridge networks, and persistent named volumes. Safe Compose operations require inspecting merged configurations (`docker compose config`) and protecting data volumes from destructive flags.

Checked targets 2026-10-23: Docker Engine 29.9.2 and Compose 5.6.1. Verify installed plugin/engine support and release notes; do not introduce a legacy top-level compose version key.

## Rules

1. Inspect the effective merged configuration (`docker compose config`), active `-f` override files, `--profile` flags, and project name (`-p` / `COMPOSE_PROJECT_NAME`) before running lifecycle commands.
2. Distinguish persistent named volumes (`pgdata:/var/lib/postgresql/data`), host bind mounts, and ephemeral container rootfs layers; never change a volume name or project name inadvertently and strand existing database state.
3. Pair `depends_on` with real protocol healthchecks (`pg_isready`, `redis-cli ping`, HTTP readiness probes) and `condition: service_healthy`, while still handling transient reconnects inside the application.
4. Bind host-published ports to `127.0.0.1:PORT:CONTAINER_PORT` when behind a local reverse proxy or for internal stores, and remember that Docker's `ports:` publishing bypasses standard `ufw`/`iptables` `INPUT` chains when bound to `0.0.0.0`.
5. Keep secrets out of committed `.env` files and `compose.yaml` literals; inspect config interpolation (`--no-interpolate` or redacted review) without echoing live credentials.
6. Never run `docker compose down -v`, `docker system prune --volumes`, or blind volume deletion on a data-bearing environment as a generic troubleshooting step.

## Core Patterns & Pitfalls

- **Readiness-Gated Startup & One-Shot Migrations**: Run database migrations as a dedicated service (or init step) with `restart: "no"` that waits for `db: condition: service_healthy`, and have the application service depend on `migrate: condition: service_completed_successfully`.
- **Host Binding Security**: Writing `ports: ["5432:5432"]` exposes PostgreSQL on `0.0.0.0:5432` to external networks even on hosts with `ufw` enabled; omit `ports:` entirely for internal-only services on a shared Compose network or bind `127.0.0.1:5432:5432`.
- **Anti-pattern — Obsolete `version: '3.8'` & `container_name` Collisions**: Omit the deprecated top-level `version:` key in Compose Specification files, and avoid hardcoding `container_name` when scaling or running parallel project stacks.

## Workflow

1. Map service dependencies, persisted state, ports and start/stop requirements.
2. Validate the merged configuration and latest compatible Compose semantics.
3. Start/update the authorized services and inspect actual health/logs.
4. Test application connectivity, restart behavior and data persistence.
5. Record effective environment, changed services and rollback/data boundary.

## Before returning

- [ ] Effective merged `docker compose config`, project name, and override files verified without legacy `version:` keys
- [ ] Internal databases/queues isolated on Compose networks or bound to `127.0.0.1` rather than `0.0.0.0`
- [ ] `healthcheck` definitions and `depends_on` readiness conditions (`service_healthy` / `service_completed_successfully`) verified
- [ ] Named data volumes and persisted state preserved (no unauthorized `down -v` or volume pruning)
- [ ] Inter-service DNS resolution, container health status, and application readiness verified

## Sources

Versioned facts checked 2026-10-23; refresh authoritative sources before new installs/upgrades.
[Compose production](https://docs.docker.com/compose/how-tos/production/), [Engine releases](https://docs.docker.com/engine/release-notes/), [Compose releases](https://github.com/docker/compose/releases).

## Skills in scope

- docker-deploy — multi-stage Dockerfile authoring, build caching, image digests, and runtime entrypoint contracts.
- container-debugging — diagnose reported container build, startup, network, permission and resource failures.
- container-hardening — review and improve container image/runtime protection for an owned application with tested compatibility.
- backup-recovery — design and verify backups and restoration for owned databases, files and application state.
