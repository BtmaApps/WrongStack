---
name: infrastructure-as-code
description: "Build and maintain Terraform, OpenTofu, Pulumi or cloud-native IaC with reviewable plans and protected state. Use when provisioning owned resources or fixing drift; preserve the project chosen engine, backend and provider contracts."
trigger: "Build and maintain Terraform, OpenTofu, Pulumi or cloud-native IaC with reviewable plans and protected state. Use when provisioning owned resources or fixing drift; preserve the project chosen engine, backend and provider contracts."
version: 1.0.2
required-capabilities: [filesystem.read]
required-tools: []
optional-capabilities: [filesystem.write, execution.shell, verification.run, web.research]
metadata:
  routing-group: operations
  domain: "infrastructure"
paths: ["*.tf", "*.tfvars", "Pulumi.yaml", "Pulumi.*.yaml"]
---

# Infrastructure As Code

## Selection card
- Task: Plan versioned Terraform or infrastructure changes.
- Start: Identify the authorized target, current health and rollback boundary.
- Finish: apply the acceptance checks below; report observed results and unresolved constraints.

## Overview

Infrastructure as Code (Terraform, OpenTofu, Pulumi, AWS CDK) manages cloud and edge resources through declarative or programmatic graphs backed by remote state. Safe IaC engineering requires strict workspace/account pinning, careful inspection of plan diffs (`create`, `update in-place`, `destroy`, `must be replaced`), state-preserving refactors (`moved` / `import` blocks), and hard separation between read-only `terraform plan` validation and state-mutating `terraform apply`.

Checked 2026-10-23: Terraform 1.17.0, OpenTofu 1.13.2, Pulumi 3.272.0 and AWS CDK library 2.274.0. Verify engine/provider/backend compatibility and licensing before choosing or migrating.

## Rules

1. Pin target cloud account/subscription/project ID, region, workspace/stack name, remote backend, and `.terraform.lock.hcl` / lockfile before running any command.
2. Treat remote state files (`terraform.tfstate`, Pulumi state) as sensitive artifacts: even variables marked `sensitive = true` are stored in plaintext inside state, so encrypt backends at rest and never commit `.tfstate` or `.tfvars` secrets to git.
3. Inspect the full execution plan (`terraform plan` / `pulumi preview`) line by line: verify every `-/+ destroy and then create replacement` or `- destroy` action, especially on stateful resources (databases, buckets, KMS keys, VPCs, DNS zones, persistent volumes).
4. Keep planning strictly separate from applying; generating a valid plan never authorizes applying, destroying, or performing state surgery without explicit user approval for that environment.
5. Never execute `terraform force-unlock`, `terraform state rm`, or `terraform destroy` as a blind workaround for state lock contention or drift; declare `moved { from = ... to = ... }` and `import { to = ... id = ... }` blocks so state migrations remain reviewable in version control.
6. Preserve the repository's chosen IaC engine (do not mix Terraform and OpenTofu state mutations on the same workspace without an explicit migration request) and pin provider version constraints.

## Core Patterns & Pitfalls

- **Zero-Downtime Resource Refactoring**: When renaming resources or splitting modules in Terraform 1.1+ / OpenTofu, add `moved` blocks and verify `0 to add, 0 to change, 0 to destroy` in the plan before applying. Protect stateful stores with `lifecycle { prevent_destroy = true }`.
- **Count vs `for_each` Indexing**: Prefer `for_each` meta-arguments keyed by stable identifiers (never `count` over a list whose middle elements can be removed) so removing one item does not cascade-recreate every subsequent index.
- **Anti-pattern — Narrow `-target` Applies as Routine Workflow**: Relying on `-target` leaves the rest of the configuration drifted from remote state; reserve `-target` for documented break-glass recovery and immediately reconcile the full plan.

## Workflow

1. Inspect current configuration/state boundary and existing provider locks.
2. Resolve latest stable compatible engine/providers and implement the narrow change.
3. Run format/validate and a scoped plan, redacting sensitive output.
4. Review actual effects and perform only authorized apply/import/migration.
5. Verify resulting resource identity/health and reconciliation with state.

## Before returning

- [ ] IaC engine, provider lockfile, target account/region, and backend workspace verified
- [ ] Formatting and static validation (`terraform fmt`, `terraform validate`) pass with no hardcoded secrets
- [ ] Plan/preview output reviewed for unintended replacements (`-/+`) or deletions on stateful resources
- [ ] Resource renames/imports expressed via declarative `moved`/`import` blocks where supported
- [ ] Plan-only vs authorized apply outcomes clearly separated and post-apply drift verified zero

## Sources

Versioned facts checked 2026-10-23; refresh authoritative sources before new installs/upgrades.
[Terraform state](https://developer.hashicorp.com/terraform/language/state), [OpenTofu docs](https://opentofu.org/docs/), [Pulumi docs](https://www.pulumi.com/docs/).

## Skills in scope

- cloud-architecture — choose and design cloud services from concrete application, data, availability and operational requirements.
- kubernetes-operations — operate and deploy owned Kubernetes workloads with explicit cluster, namespace and rollout identity.
- ci-cd — build and repair reproducible CI and deployment workflows with explicit artifacts, permissions and release gates.
- backup-recovery — design and verify backups and restoration for owned databases, files and application state.
