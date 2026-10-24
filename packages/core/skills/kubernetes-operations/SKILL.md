---
name: kubernetes-operations
description: "Operate and deploy owned Kubernetes workloads with explicit cluster, namespace and rollout identity. Use when configuring Deployments, Services, probes, resources or diagnosing a known workload; do not expand an application task into uncontrolled cluster administration."
trigger: "Operate and deploy owned Kubernetes workloads with explicit cluster, namespace and rollout identity. Use when configuring Deployments, Services, probes, resources or diagnosing a known workload; do not expand an application task into uncontrolled cluster administration."
version: 1.0.2
required-capabilities: [filesystem.read]
required-tools: []
optional-capabilities: [filesystem.write, execution.shell, verification.run, web.research]
metadata:
  routing-group: operations
  domain: "infrastructure"
paths: ["kustomization.{yml,yaml}", "Chart.yaml", "**/k8s/**/*.{yml,yaml}"]
---

# Kubernetes Operations

## Selection card
- Task: Operate Kubernetes workloads and autoscaling.
- Start: Identify the authorized target, current health and rollback boundary.
- Finish: apply the acceptance checks below; report observed results and unresolved constraints.

## Overview

Kubernetes operations manage declarative workload lifecycles (`Deployment`, `StatefulSet`, `Job`, `Service`, `Ingress`/`HTTPRoute`, `HorizontalPodAutoscaler`, `PodDisruptionBudget`) within an explicitly pinned cluster and namespace. Safe Kubernetes engineering requires separating `startupProbe`, `readinessProbe`, and `livenessProbe` semantics, previewing server-side diffs before apply, and verifying full rollout convergence (`kubectl rollout status`) rather than stopping at `kubectl apply` exit zero.

Checked stable Kubernetes target: 1.37.1 on 2026-10-23. Verify managed-provider support, API versions, client/server skew and addon compatibility before upgrades.

## Rules

1. Pin `--context` and `--namespace` (`-n`) explicitly on every command and verify whether the workload is managed by GitOps (Argo CD / Flux), Helm, or Kustomize before applying imperative changes that a controller would overwrite or fight.
2. Pin immutable container image tags or digests (never mutable `:latest` in production manifests) and preview changes with `kubectl diff` or `kubectl apply --dry-run=server` before mutating cluster state.
3. Separate probe responsibilities:
   - `startupProbe`: gates slow application boot so liveness does not kill starting pods.
   - `readinessProbe`: removes a pod from `Service` endpoints during temporary overload or drain without restarting it.
   - `livenessProbe`: restarts a genuinely deadlocked local process—**never** check shared external databases/dependencies in `livenessProbe`, or a transient DB blip will trigger a cluster-wide `CrashLoopBackOff` cascade.
4. Size `resources.requests` and `limits` deliberately (set memory request = limit to avoid unexpected OOM eviction; avoid tight CPU limits that cause CFS throttling spikes) and pair multi-replica workloads with a `PodDisruptionBudget` and topology spread constraints.
5. Keep `Secret` values redacted (never `kubectl get secret -o yaml` into logs/reports), scope `ServiceAccount` RBAC with `automountServiceAccountToken: false` when cluster API access is unneeded, and never delete PVCs to "reset" a failing `StatefulSet`.
6. Coordinate graceful termination (`preStop` sleep/drain hook + `terminationGracePeriodSeconds` > load-balancer drain window) and verify `kubectl rollout status` plus real `Service`/Ingress traffic.

## Core Patterns & Pitfalls

- **Triage Sequence for Failing Pods**: Inspect `kubectl get pods` status (`Pending`, `ImagePullBackOff`, `CreateContainerConfigError`, `CrashLoopBackOff`, `OOMKilled`), then `kubectl describe pod <name>` events and `Last State` (`Exit Code: 137`/`1`), then `kubectl logs <pod> --previous`.
- **Zero-Downtime Rollout Drain**: Kubernetes updates EndpointSlices asynchronously alongside sending `SIGTERM`; adding a short `preStop` delay (e.g., 5s) before the server stops accepting new connections prevents `502 Bad Gateway` blips during rolling updates.
- **Anti-pattern — Checking Downstream DB/APIs in `livenessProbe`**: If `livenessProbe` queries PostgreSQL or an upstream API, any brief downstream slowdown causes kubelet to kill and restart all healthy application pods simultaneously.

## Workflow

1. Inspect the named workload, events, focused logs and effective deployment configuration.
2. Resolve stable platform/API compatibility and the narrow repair/rollout.
3. Validate manifests and preview changes in the exact target context.
4. Perform authorized apply/rollout and observe probes, replica/version identity and application requests.
5. Report rollout/recovery and persistent data boundary separately.

## Before returning

- [ ] Target `--context`, `--namespace`, workload controller, and GitOps/Helm/Kustomize ownership verified
- [ ] Manifests validated (`--dry-run=server` / `kubectl diff`) with immutable image tags/digests
- [ ] `startupProbe`, `readinessProbe`, and `livenessProbe` decoupled from cascading external dependency restarts
- [ ] Resource requests/limits, `terminationGracePeriodSeconds`, and `PodDisruptionBudget` aligned with workload
- [ ] `kubectl rollout status`, pod events/logs, and user-facing service traffic verified with zero secret leakage

## Sources

Versioned facts checked 2026-10-23; refresh authoritative sources before new installs/upgrades.
[Kubernetes releases](https://kubernetes.io/releases/), [Deployment contract](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/).

## Skills in scope

- container-hardening — review and improve container image/runtime protection for an owned application with tested compatibility.
- release-rollback — plan and execute authorized release promotion or rollback with exact artifact and data compatibility.
- observability — Prometheus/OpenTelemetry pod metrics, probe failure alerts, and structured container log collection.
- infrastructure-as-code — build and maintain Terraform, OpenTofu, Pulumi or cloud-native IaC with reviewable plans and protected state.
