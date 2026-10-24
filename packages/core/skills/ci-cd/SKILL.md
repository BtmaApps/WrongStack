---
name: ci-cd
version: 1.0.2
description: "Build and repair reproducible CI and deployment workflows with explicit artifacts, permissions and release gates. Use when working on GitHub Actions or other pipelines, caches, matrices, packaging or deployment evidence; preserve the authoritative checks and never hide failures."
trigger: "working on GitHub Actions or other pipelines, caches, matrices, packaging or deployment evidence; preserve the authoritative checks and never hide failures."
required-capabilities: [filesystem.read, filesystem.write]
required-tools: []
optional-capabilities: [verification.run, web.research]
metadata:
  routing-group: operations
paths: [".github/workflows/*.{yml,yaml}", ".gitlab-ci.yml", "Jenkinsfile", ".circleci/config.yml", "azure-pipelines.yml"]
---

# CI/CD

## Selection card
- Task: Build automated CI checks and delivery pipelines.
- Start: Identify the authorized target, current health and rollback boundary.
- Finish: apply the acceptance checks below; report observed results and unresolved constraints.

## Overview

Make the pipeline validate the exact source and artifact being shipped.
Distinguish a local check, hosted CI result, published artifact and deployed
service. They are separate evidence boundaries.

## Rules

1. Reproduce the failing authoritative command before editing a pipeline.
   Inspect trigger, job dependencies, working directory, runtime and lockfile.
2. Use the latest stable toolchain target when updating it; verify runner image,
   action version, engine/peer constraints and official migration notes.
3. Give jobs minimal permissions. Pin third-party actions to reviewed commit SHAs
   with identifiable release comments where repository policy calls for it.
4. Keep untrusted PR data out of shell code. Pass it as data through environment
   variables or structured arguments; never run untrusted code with release secrets.
5. Cache dependencies/build inputs with keys that cover the lockfile, runtime
   and platform. A cache hit is not evidence that today's tests ran.
6. Serialize release/shared artifact writers. Failures and skipped jobs remain
   visible; do not add continue-on-error to make a required gate appear green.

## Workflow

1. Map trigger → checks → build → artifact → deployment and who may run each.
2. Fix the narrow source/config cause. Preserve unrelated baselines and required
   branch rules.
3. Run focused local checks and workflow validation available in the repo.
4. If remote execution is authorized, inspect jobs for the exact commit, read
   failed logs and verify required checks rather than an old successful run.
5. Before release, inspect artifact contents, version identity and install/startup.
6. Report commands, hosted run/commit when applicable, artifact/deployment status
   and remaining environment-specific gaps.

## Core Patterns & Pitfalls

- **Least-Privilege `permissions:` & Concurrency**: Declare explicit top-level `permissions: { contents: read }` in GitHub Actions workflows (elevating per-job only for OIDC/pages/packages), set job `timeout-minutes`, and configure `concurrency:` groups (cancel-in-progress for PR branches, serialized queue without cancel for production deploys).
- **Script Injection Prevention**: Never interpolate untrusted GitHub context expressions (`${{ github.event.pull_request.title }}`, branch names, commit messages) directly inside a `run:` shell block; bind them to `env:` variables first and reference `"$PR_TITLE"` in the shell.
- **Anti-pattern — `pull_request_target` with Untrusted Checkout**: Checking out and executing PR head code inside a `pull_request_target` workflow grants untrusted forks access to repository secrets and write tokens.

## Sources

[GitHub secure workflow use](https://docs.github.com/en/actions/reference/security/secure-use),
reviewed 2026-10-23. Follow the selected CI platform's own current contracts.

## Acceptance checks

- [ ] Workflow triggers, working directories, frozen lockfile installs, and runner/runtime versions match repo standards
- [ ] Explicit `permissions`, `timeout-minutes`, and `concurrency` rules configured without `continue-on-error` masking
- [ ] Untrusted event fields passed via `env:` variables rather than inline `${{ ... }}` shell interpolation
- [ ] Cache keys include OS, runtime version, and lockfile hashes; local check vs hosted CI vs deployed state reported separately

## Skills in scope

- tech-stack — runtime, package manager, and toolchain version alignment across local and CI runners.
- docker-deploy — multi-stage container builds, layer cache exports, and digest pinning in CI.
- verify-before-done — running the authoritative repo verification suite before declaring pipeline fixes complete.
- git-flow — branch protection rules, commit hygiene, and release tag workflows.
