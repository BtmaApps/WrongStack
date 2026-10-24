---
name: incident-response
description: "Diagnose and recover an owned service incident with bounded changes, timeline evidence and verified health. Use during outages, bad deployments or data/service degradation; preserve evidence and separate mitigation from root-cause repair."
trigger: "Diagnose and recover an owned service incident with bounded changes, timeline evidence and verified health. Use during outages, bad deployments or data/service degradation; preserve evidence and separate mitigation from root-cause repair."
version: 1.0.2
required-capabilities: [filesystem.read]
required-tools: []
optional-capabilities: [filesystem.write, execution.shell, verification.run, web.research]
metadata:
  routing-group: operations
  domain: "operations"
---

# Incident Response

## Selection card
- Task: Coordinate production outage triage and recovery.
- Start: Identify the authorized target, current health and rollback boundary.
- Finish: apply the acceptance checks below; report observed results and unresolved constraints.

## Overview

Incident response restores user-facing service health safely and rapidly by establishing blast radius and timeline facts first, preserving volatile forensic/runtime evidence before restarting or mutating state, applying the smallest reversible mitigation (rollback, feature flag, traffic drain, or capacity limit), and separating immediate stabilization from post-incident root-cause repair.

Use current deployed versions, platform limits and actual telemetry. Stored runbooks and prior incidents guide hypotheses but do not prove this incident cause.

## Rules

1. Pin the blast radius immediately: affected user journeys/SLIs (error rate, p99 latency, saturation, queue backlog), onset timestamp (UTC), affected regions/tenants, and authorized responder scope.
2. Correlate the onset window against recent changes (deployments, config/secret updates, schema migrations, feature flags, traffic spikes, upstream provider status, expired certificates/quotas) and capture volatile state before any restart.
3. Prefer the fastest reversible mitigation backed by evidence (artifact/config rollback, feature-flag disable, rate-limit shedding, read-replica/pool relief) over writing untested hotfix code under outage pressure.
4. Coordinate a single mutation owner and log every command/change with UTC timestamps so concurrent responders do not trigger overlapping deploys or conflicting database actions.
5. Verify recovery against end-to-end user SLIs and downstream queue/DB drain—not merely container/process liveness (`200 OK` on `/healthz`).
6. Preserve logs, metrics, crash dumps, and database snapshots for postmortem analysis; redact secrets/PII in incident summaries.

## Core Patterns & Pitfalls

- **Evidence Before Restart**: Before restarting a wedged or OOMing service, capture `journalctl`/`docker logs --since`, active DB queries (`pg_stat_activity`), thread/heap/goroutine profiles, and current release digest so the root cause is not wiped.
- **Metastable Failure & Retry Storms**: When a database or upstream dependency recovers after saturation, unthrottled client retries and queued backlogs can immediately knock it back down. Shed load, stagger worker concurrency, or warm caches before restoring full traffic.
- **Anti-pattern — Blind Code Rollback Across Irreversible Schema Changes**: Rolling application code back to `vN-1` after `vN` ran a destructive database migration or wrote new enum/payload shapes can turn a partial degradation into a total crash loop.

## Workflow

1. Establish impact, timeline and current health signals.
2. Localize the failing boundary and compare recent releases/configuration.
3. Execute authorized mitigation with a recovery/abort condition.
4. Verify service and data outcomes, then monitor the agreed window.
5. Document supported cause, actions, remaining risk and focused follow-up repairs.

## Before returning

- [ ] Blast radius, UTC timeline, onset correlation, and volatile pre-mitigation evidence captured
- [ ] Mitigation executed within authorized scope with a clear abort/rollback boundary
- [ ] User-facing SLIs (error rate, latency, queue/DB health) verified across a sustained observation window
- [ ] Confirmed facts, ruled-out hypotheses, and remaining unknowns clearly separated
- [ ] Follow-up corrective actions and regression/alerting gaps documented without leaked secrets

## Sources

Versioned facts checked 2026-10-23; refresh authoritative sources before new installs/upgrades.
[OpenTelemetry](https://opentelemetry.io/docs/), [Google SRE incident guidance](https://sre.google/sre-book/managing-incidents/).

## Skills in scope

- observability — SLI/SLO dashboards, log/trace correlation, and high-signal alert triage during outages.
- remote-debugging — diagnose a reported application failure on explicitly authorized remote hosts using bounded logs and runtime evidence.
- release-rollback — plan and execute authorized release promotion or rollback with exact artifact and data compatibility.
- backup-recovery — design and verify backups and restoration for owned databases, files and application state.
