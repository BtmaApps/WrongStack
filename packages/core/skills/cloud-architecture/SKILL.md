---
name: cloud-architecture
description: "Choose and design cloud services from concrete application, data, availability and operational requirements. Use when comparing AWS, Azure, GCP, Cloudflare or VPS architectures; preserve provider/account constraints and verify region-specific capabilities."
trigger: "Choose and design cloud services from concrete application, data, availability and operational requirements. Use when comparing AWS, Azure, GCP, Cloudflare or VPS architectures; preserve provider/account constraints and verify region-specific capabilities."
version: 1.0.2
required-capabilities: [filesystem.read]
required-tools: []
optional-capabilities: [filesystem.write, execution.shell, verification.run, web.research]
metadata:
  routing-group: operations
  domain: "infrastructure"
---

# Cloud Architecture

## Selection card
- Task: Choose cloud topology, failure domains and services.
- Start: Identify the authorized target, current health and rollback boundary.
- Finish: apply the acceptance checks below; report observed results and unresolved constraints.

## Overview

Cloud architecture translates concrete workload constraints (traffic shape, p95/p99 latency, data residency, RPO/RTO, team operational capacity, and budget) into explicit compute, storage, network, and IAM boundaries across AWS, GCP, Azure, Cloudflare Edge, or VPS topologies. Good architecture favors the simplest topology whose failure modes the team can actually operate and recover.

Cloud products do not share one global latest version. Verify current service availability, quotas, runtime/SDK support and pricing from the selected provider before an architectural decision.

## Rules

1. Anchor every decision in stated workload metrics: request rate, payload size, statefulness, latency targets, RPO/RTO, compliance/residency, and team on-call capacity.
2. Evaluate candidate topologies across concrete boundaries: compute execution limits (CPU/duration/memory), stateful connection pooling, cross-AZ/region egress, IAM identity blast radius, and single points of failure.
3. Define data ownership, residency regions, public vs private network ingress/egress paths, and secret/key management explicitly.
4. Build cost models from explicit unit drivers (compute GB-s / vCPU-hours, IOPS/storage GB, NAT/cross-AZ/egress GB, per-million requests) using dated provider pricing rather than guessed monthly totals.
5. Prefer boring, well-supported managed primitives or single-stack deployments over prematurely distributed multi-cloud or microservice meshes.
6. Keep architecture decisions distinct from live provisioning; an architecture recommendation never authorizes creating cloud accounts, incurring spend, or migrating live traffic without approval.

## Core Patterns & Pitfalls

- **Edge/Serverless vs Stateful Compute**: Match edge/serverless runtimes (Cloudflare Workers, Lambda, Cloud Run) to bursty, stateless, or edge-cached workloads, while pairing relational databases with connection pooling (Hyperdrive, RDS Proxy, PgBouncer) and keeping long-running CPU/stateful workloads on right-sized containers or VMs.
- **Hidden Cost Multipliers**: Account for managed NAT Gateway per-GB processing, cross-AZ data transfer, high-cardinality observability ingestion, and per-request KMS/secret lookups that frequently dwarf base compute bills.
- **Anti-pattern — Resume-Driven Complexity**: Recommending multi-region active-active databases or Kubernetes clusters for a single-team CRUD workload without a proven availability or regulatory requirement multiplies failure modes and operational toil.

## Workflow

1. Map current architecture, requirements and fixed provider/region constraints.
2. Verify relevant current product/limit/pricing documentation.
3. Compare a few viable options with assumptions and operational tradeoffs.
4. Define contracts, failure/recovery model, rollout and observable acceptance.
5. For authorized implementation, hand the selected design into IaC/deployment and verify it.

## Before returning

- [ ] Workload, latency, RPO/RTO, compliance, and operational capacity constraints explicitly stated
- [ ] Candidate options compared with clear trade-offs, failure domains, and rejected alternatives
- [ ] Network exposure, IAM trust boundaries, and data residency/ownership mapped
- [ ] Cost drivers itemized with dated provider assumptions (compute, storage, egress/NAT, observability)
- [ ] Design recommendations clearly separated from authorized IaC provisioning or migration steps

## Sources

Versioned facts checked 2026-10-23; refresh authoritative sources before new installs/upgrades.
[AWS framework](https://docs.aws.amazon.com/wellarchitected/latest/framework/welcome.html), [Azure architecture](https://learn.microsoft.com/en-us/azure/architecture/), [Google Cloud framework](https://cloud.google.com/architecture/framework).

## Skills in scope

- infrastructure-as-code — build and maintain Terraform, OpenTofu, Pulumi or cloud-native IaC with reviewable plans and protected state.
- cloudflare-workers — build and maintain Cloudflare Workers with typed bindings, explicit compatibility and isolated validation.
- vps-deploy — deploy an owned application to an explicitly authorized VPS with versioned artifacts, service identity and live health evidence.
- database-development — implement database access, models and queries with explicit consistency, transactions and bounded results.
