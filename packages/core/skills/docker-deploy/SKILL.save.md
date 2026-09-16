# Docker Deploy (Compact)

Small, reproducible, non-root images whose layers are ordered by how often they change.

## Rules

1. Multi-stage: toolchain in build, only production artifacts in runtime.
2. Pin base images to a version tag; never `latest`.
3. Copy manifests and lockfile, install, then copy source.
4. Install from the lockfile.
5. Run as a non-root user.
6. No secrets in `ARG`/`ENV`/layers; runtime env or BuildKit secret mounts.
7. Exec-form `CMD`/`ENTRYPOINT`; add an init when spawning children.
8. `.dockerignore` excludes .git, dependencies, build output, env files.
9. `HEALTHCHECK` for long-running services.
