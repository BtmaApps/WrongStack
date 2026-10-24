---
name: container-hardening
description: "Review and improve container image/runtime protection for an owned application with tested compatibility. Use when reducing privileges, protecting secrets or setting container resource/exposure policies; do not label every hardening preference a confirmed vulnerability."
trigger: "Review and improve container image/runtime protection for an owned application with tested compatibility. Use when reducing privileges, protecting secrets or setting container resource/exposure policies; do not label every hardening preference a confirmed vulnerability."
version: 1.0.2
required-capabilities: [filesystem.read]
required-tools: []
optional-capabilities: [filesystem.write, execution.shell, verification.run, web.research]
metadata:
  routing-group: operations
  domain: "containers"
---

# Container Hardening

## Selection card
- Task: Reduce container privilege and secret exposure.
- Start: Identify the authorized target, current health and rollback boundary.
- Finish: apply the acceptance checks below; report observed results and unresolved constraints.

## Overview

Container hardening minimizes the runtime blast radius of an application image and its container execution profile by stripping build-time toolchains, running as an unprivileged numeric `USER`, enforcing `no-new-privileges` and capability drops (`cap_drop: [ALL]`), mounting the root filesystem read-only where compatible, and keeping secrets out of image layers.

Use current Docker/OCI/runtime documentation and the deployed platform version. Checked Docker target: 29.9.2; apply settings supported by the actual runtime.

## Rules

1. Inventory the application's actual runtime requirements (listening port >= 1024, writable temp/cache paths, outbound network needs, native shared libraries) before applying restrictions.
2. Run as a non-root numeric UID/GID (`USER 10001:10001`), set `read_only: true` (`--read-only`) with bounded `tmpfs` mounts (`/tmp:rw,noexec,nosuid,size=64m`) where compatible, and set `security_opt: ["no-new-privileges:true"]`.
3. Drop Linux capabilities (`cap_drop: ["ALL"]`) and re-add only explicitly verified capabilities; never enable `privileged: true`, host network/PID namespaces, or `/var/run/docker.sock` mounts for ordinary application workloads.
4. Pass build-time credentials exclusively via BuildKit secret mounts (`RUN --mount=type=secret,id=...`) and runtime credentials via mounted secrets/environment files—never via Dockerfile `ARG` or `ENV` instructions that persist in `docker history` / image metadata.
5. Configure explicit memory, CPU, and PID limits (`mem_limit`, `pids_limit`) so a runaway process or fork bomb cannot starve the host.
6. Pin base images by version tag and SHA-256 digest (`image:tag@sha256:...`), and evaluate CVE scanner findings by actual reachability and runtime stage presence rather than raw uncontextualized counts.

## Core Patterns & Pitfalls

- **Read-Only Rootfs Compatibility**: Many runtimes write temporary files, JIT caches, or PID files by default (e.g., `/tmp`, Nginx `/var/cache/nginx` & `/run`, Python bytecode). Test `read_only: true` against the real startup, request, and graceful-shutdown paths with targeted `tmpfs` or volume mounts.
- **Layer Secret Persistence**: Deleting a secret file in a later `RUN rm /root/.npmrc` layer does **not** remove it from the image tarball; an earlier layer still contains the secret unless `--mount=type=secret` or a separate non-shipped build stage was used.
- **Anti-pattern — Breaking Production Healthchecks in Distroless Images**: Switching a final stage to `distroless` or `scratch` removes `/bin/sh`, `curl`, and `wget`; ensure container healthchecks use a built-in binary subcommand (`["/app/server", "healthcheck"]`) or orchestrator HTTP probe before removing shell utilities.

## Workflow

1. Inspect image/config and the actual exposure/ownership boundary.
2. Record current privileges and source-supported risks.
3. Apply a coherent narrow restriction set and rebuild/run the application.
4. Exercise startup, persistence, shutdown and necessary network/device operations.
5. Report implemented protections, compatibility checks and remaining justified privileges.

## Before returning

- [ ] No secrets or private tokens present in Dockerfile `ARG`/`ENV` or exported image layers (`docker history`)
- [ ] Container runs as non-root UID/GID on an unprivileged port with `no-new-privileges` and minimal capabilities
- [ ] `read_only` rootfs, `tmpfs` writable paths, and `mem_limit` / `pids_limit` verified against real app startup and requests
- [ ] Base image pinned and final runtime stage free of unnecessary compilers, package managers, or dev dependencies
- [ ] Verified vulnerabilities distinguished from defence-in-depth hardening recommendations

## Sources

Versioned facts checked 2026-10-23; refresh authoritative sources before new installs/upgrades.
[Docker security](https://docs.docker.com/engine/security/), [Build secrets](https://docs.docker.com/build/building/secrets/).

## Skills in scope

- security-scanner — review owned source, configuration and dependency metadata for supported security findings with precise evidence and remediation.
- docker-deploy — multi-stage Dockerfile construction, BuildKit caching, and runtime entrypoint setup.
- compose-operations — operate and evolve multi-service Docker Compose environments with explicit networks, volumes and environment boundaries.
- kubernetes-operations — operate and deploy owned Kubernetes workloads with explicit cluster, namespace and rollout identity.
