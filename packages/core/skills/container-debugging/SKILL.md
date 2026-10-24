---
name: container-debugging
description: "Diagnose reported container build, startup, network, permission and resource failures. Use when an image or Compose service fails; reproduce against the final image/config and avoid data-destroying cleanup as a workaround."
trigger: "Diagnose reported container build, startup, network, permission and resource failures. Use when an image or Compose service fails; reproduce against the final image/config and avoid data-destroying cleanup as a workaround."
version: 1.0.2
required-capabilities: [filesystem.read]
required-tools: []
optional-capabilities: [filesystem.write, execution.shell, verification.run, web.research]
metadata:
  routing-group: operations
  domain: "containers"
---

# Container Debugging

## Selection card
- Task: Diagnose a running container failure.
- Start: Identify the authorized target, current health and rollback boundary.
- Finish: apply the acceptance checks below; report observed results and unresolved constraints.

## Overview

Container debugging isolates build-stage, runtime startup, networking, filesystem permission, and resource-limit failures by inspecting deterministic container state (`docker inspect`, exit codes, `OOMKilled`, layer history, and namespace DNS/routing) rather than guessing or wiping volumes.

Current checked engine target is Docker 29.9.2. Inspect actual daemon/client/build runtime and platform; build success and final-stage startup are separate checks.

## Rules

1. Pin the active Docker context, image digest, target platform (`linux/amd64` vs `linux/arm64`), effective `Entrypoint`/`Cmd`, and environment variables (`docker inspect` with secrets redacted).
2. Separate multi-stage build dependencies from final runtime stage files: check missing `COPY --from=builder` artifacts, `.dockerignore` exclusions, and libc ABI mismatches (glibc binaries copied into `alpine`/musl or `scratch` images).
3. Decode container termination state (`State.ExitCode`, `State.OOMKilled`, `State.Error`) before tweaking healthcheck intervals or restart policies:
   - `126` / `127`: non-executable entrypoint, missing binary/interpreter, or `CRLF` shebang line endings (`exec user process caused: no such file or directory`).
   - `137`: `SIGKILL` — check `State.OOMKilled` (`true` = container memory limit exceeded) or `docker stop` grace-period timeout when PID 1 ignores `SIGTERM`.
   - `139`: `SIGSEGV` — native module or platform/libc mismatch.
4. Verify container network attachment and bind addresses: a process listening on `127.0.0.1` inside a container is unreachable from host port mappings or sibling containers (must bind `0.0.0.0` or `::`).
5. Diagnose non-root UID/GID vs volume ownership mismatches (`COPY --chown=uid:gid`, named volume init permissions) without resorting to `chmod -R 777`.
6. Keep existing data volumes, images, and diagnostic evidence intact; never run `docker system prune` or `down -v` as a blind fix.

## Core Patterns & Pitfalls

- **PID 1 Signal Forwarding**: Shell-form `ENTRYPOINT "node server.js"` runs `/bin/sh -c` as PID 1, which does not forward `SIGTERM` to the child process and causes 10-second `SIGKILL` delays (`ExitCode 137`). Use exec-form `["node", "server.js"]`.
- **Alpine / Distroless Missing Loader**: When `docker run` fails with `exec ...: no such file or directory` even though the binary exists in the image, check for a missing dynamic linker (`/lib64/ld-linux-*.so.2` on musl/`scratch`) or Windows `CRLF` line endings on an entrypoint script.
- **Anti-pattern — Masking Crashes with `restart: always`**: Adding a restart loop or stretching healthcheck `start_period` without fixing the underlying exit code hides crash loops and exhausts upstream dependencies.

## Workflow

1. Reproduce the failure with the exact image/config and bounded checks.
2. Trace build output or startup failure to the responsible layer/path.
3. Compare working local conditions with the image/host platform.
4. Make the narrow Dockerfile/config/application repair.
5. Rebuild/run the final stage and verify health, signals and the failing user path.

## Before returning

- [ ] Active Docker context, image digest, target architecture, and container `State` (`ExitCode`, `OOMKilled`) recorded
- [ ] Root cause traced to specific layer, entrypoint/signal form, bind address (`0.0.0.0`), ABI/loader, or UID/GID permission boundary
- [ ] Final runtime stage rebuilt and verified for clean startup, healthcheck pass, and graceful `SIGTERM` stop
- [ ] Fix applied with minimal privileges (no `chmod 777`, `--privileged`, or destructive volume resets)
- [ ] Data volumes and unrelated containers left untouched

## Sources

Versioned facts checked 2026-10-23; refresh authoritative sources before new installs/upgrades.
[Docker troubleshooting](https://docs.docker.com/engine/daemon/troubleshoot/), [Docker build practices](https://docs.docker.com/build/building/best-practices/).

## Skills in scope

- docker-deploy — multi-stage Dockerfile structure, layer caching, and production image builds.
- compose-operations — operate and evolve multi-service Docker Compose environments with explicit networks, volumes and environment boundaries.
- linux-service-ops — configure and troubleshoot application services on an authorized Linux host with explicit service ownership.
- debugging — isolate application-level defects once container runtime/environment causes are ruled out.
