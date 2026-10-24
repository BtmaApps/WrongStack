---
name: release-rollback
description: "Plan and execute authorized release promotion or rollback with exact artifact and data compatibility. Use when deploying versions, changing traffic or recovering a bad release; do not equate reversing code with restoring data."
trigger: "Plan and execute authorized release promotion or rollback with exact artifact and data compatibility. Use when deploying versions, changing traffic or recovering a bad release; do not equate reversing code with restoring data."
version: 1.0.2
required-capabilities: [filesystem.read]
required-tools: []
optional-capabilities: [filesystem.write, execution.shell, verification.run, web.research]
metadata:
  routing-group: operations
  domain: "deployment"
---

# Release Rollback

## Selection card
- Task: Verify release promotion and rollback paths.
- Start: Identify the authorized target, current health and rollback boundary.
- Finish: apply the acceptance checks below; report observed results and unresolved constraints.

## Overview

Release promotion and rollback coordinate immutable build artifacts, configuration revisions, traffic shifting (rolling, blue/green, canary), and stateful schema/queue compatibility across versions `vN-1` and `vN`. Because reverting application code does not automatically undo database writes, schema drops, or emitted queue messages, every release requires a pre-verified rollback boundary before traffic moves.

Read [promotion and recovery](references/promotion.md) for a consequential release. Use current platform rollout/version APIs and supported image/runtime targets.

## Rules

1. Pin the exact current running version (`vN-1` git SHA, image digest / deployment version ID, and active config revision) before promoting `vN`.
2. Define objective promotion gates and rollback triggers upfront: health/readiness endpoints, error-rate and p95 latency thresholds, queue consumer error rates, and the required observation window.
3. Verify `vN-1` ↔ `vN` bidirectional compatibility across database schemas (expand-and-contract migrations), Redis/cache payload formats, and background job payloads so in-flight requests and rollback targets do not crash on newer records.
4. Ensure a single deployment writer operates at a time; never overlap manual rollbacks with active CI/CD auto-deploy pipelines.
5. Retain the `vN-1` immutable artifact, static assets (for cached HTML clients), and config snapshot so rollback is an immediate pointer/version switch rather than a slow rebuild from git.
6. Separate local release preparation from live promotion or rollback; execute live traffic shifts only within the user's explicit authorization.

## Core Patterns & Pitfalls

- **Expand-and-Contract Rollback Safety**: Deploy backward-compatible additive schema changes (`expand`) first, promote application code `vN` while keeping `vN-1` able to read/write the table, and run destructive column/table drops (`contract`) only in a later release after the rollback window closes.
- **Static Asset & Chunk Skew**: During rolling updates or rollbacks, browsers with cached HTML from `vN-1` (or `vN`) still request hashed JS/CSS chunks from that version; retain both versions' static bundles on the CDN/origin across the transition window.
- **Anti-pattern — Rebuilding on Rollback**: Triggering a fresh CI build of an old git commit during an outage risks broken upstream registries, drifted unpinned dependencies, and 10+ minute recovery delays instead of switching to the already-built `vN-1` image digest or version ID.

## Workflow

1. Capture current deployment and prepare the exact new artifact.
2. Validate compatibility and recovery in an isolated environment.
3. Promote using the supported platform strategy and observe the agreed signals.
4. If authorized rollback conditions hold, restore the known compatible artifact/config.
5. Verify user path and release identity after either action; report remaining data repair separately.

## Before returning

- [ ] Prior (`vN-1`) and target (`vN`) git SHAs, immutable artifact digests, and config revisions recorded
- [ ] Schema, cache, and queue payload backward compatibility verified across `vN-1` and `vN`
- [ ] Promotion health gates, observation window, and exact rollback command verified
- [ ] Post-promotion or post-rollback live version identity and user-facing health confirmed
- [ ] Any irreversible state changes (sent webhooks/emails, schema mutations, new records) reported explicitly

## Sources

Versioned facts checked 2026-10-23; refresh authoritative sources before new installs/upgrades.
[Cloudflare deployment versions](https://developers.cloudflare.com/workers/configuration/versions-and-deployments/), [Kubernetes deployments](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/).

## Skills in scope

- ci-cd — build and repair reproducible CI and deployment workflows with explicit artifacts, permissions and release gates.
- vps-deploy — deploy an owned application to an explicitly authorized VPS with versioned artifacts, service identity and live health evidence.
- database-migrations — design and verify schema migrations, bounded backfills and deployment compatibility for databases.
- incident-response — diagnose and recover an owned service incident with bounded changes, timeline evidence and verified health. Use during outages, bad deployments or data/service degradation; preserve evidence and separate mitigation from root-cause repair.
