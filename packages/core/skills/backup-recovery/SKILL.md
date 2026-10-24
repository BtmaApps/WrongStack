---
name: backup-recovery
description: "Design and verify backups and restoration for owned databases, files and application state. Use when preparing recovery, migrating data or testing backups; protect the source and prove restore into an isolated destination before calling recovery ready."
trigger: "Design and verify backups and restoration for owned databases, files and application state. Use when preparing recovery, migrating data or testing backups; protect the source and prove restore into an isolated destination before calling recovery ready."
version: 1.0.2
required-capabilities: [filesystem.read]
required-tools: []
optional-capabilities: [filesystem.write, execution.shell, verification.run, web.research]
metadata:
  routing-group: operations
  domain: "operations"
---

# Backup Recovery

## Selection card
- Task: Prove backup restore and recovery objectives.
- Start: Identify the authorized target, current health and rollback boundary.
- Finish: apply the acceptance checks below; report observed results and unresolved constraints.

## Overview

Backup and recovery engineering proves that durable application state (relational/document databases, object storage blobs, and configuration/encryption metadata) can be restored into an isolated target within defined Recovery Point Objective (RPO) and Recovery Time Objective (RTO) bounds. A backup file's existence or zero-exit cron script is never proof of recoverability—only a verified restore into an isolated target proves recovery readiness.

Use the data engine/platform current supported backup and restore format. Checked PostgreSQL stable target: 18.6; verify tool/server compatibility and recovery semantics before database operations.

## Rules

1. Define protected data stores, RPO/RTO targets, retention schedules, encryption key custody, and cross-store consistency boundaries (e.g., database rows referencing object-storage keys).
2. Distinguish logical dumps (`pg_dump -Fc`), physical base backups + WAL archiving (PITR), volume snapshots, and synchronous/asynchronous replicas; replication mirrors accidental `DROP`/`DELETE` statements immediately and is not a substitute for point-in-time backups.
3. Verify off-host storage immutability/encryption, checksum integrity, and client/server version alignment (`pg_dump` / `pg_restore` major version compatibility).
4. Always test restoration into a freshly provisioned, isolated database/target and validate table row counts, foreign-key/index constraints, sequences, and representative application queries.
5. Never overwrite a live production database or purge retained backup archives without explicit, step-by-step recovery authorization.
6. Record exact backup capture timestamps, WAL/binlog boundaries, and any uncaptured data window transparently.

## Core Patterns & Pitfalls

- **PostgreSQL Logical vs Physical Restore Drill**: Prefer custom format (`pg_dump --format=custom --no-owner`) paired with `pg_restore --exit-on-error --single-transaction` (where compatible) into a scratch database, or physical basebackup + WAL replay to a specific recovery target timestamp for PITR verification.
- **Cross-Store Coherency**: When database records point to S3/R2 objects, enable bucket versioning/soft-delete retention matching the database PITR window so restored rows do not point to permanently deleted blobs.
- **Anti-pattern — Zero-Byte or Unrestorable Dump Files**: Piping `pg_dump | gzip > backup.sql.gz` without `set -euo pipefail` or exit-code checks can write a 20-byte gzip header over a failed connection and report success.

## Workflow

1. Inventory stores and dependencies needed for a coherent recovery point.
2. Configure the appropriate backup workflow with bounded operational impact.
3. Verify completion metadata, integrity and access from the recovery environment.
4. Restore a representative backup into isolation and run data/application checks.
5. Document tested commands, timing, recovered scope and the live cutover boundary.

## Before returning

- [ ] RPO/RTO targets, backup format (logical vs physical/PITR), and client/server versions verified
- [ ] Backup capture checks exit codes, non-empty size, checksum integrity, and off-host encryption
- [ ] Isolated restore drill executed without touching live data or existing backup retention
- [ ] Restored schema constraints, sequences, row counts, and application read/write checks verified
- [ ] Exact recovery point timestamp, restore duration, and any uncaptured gap documented

## Sources

Versioned facts checked 2026-10-23; refresh authoritative sources before new installs/upgrades.
[PostgreSQL backup](https://www.postgresql.org/docs/current/backup.html), [PostgreSQL versioning](https://www.postgresql.org/support/versioning/).

## Skills in scope

- database-migrations — design and verify schema migrations, bounded backfills and deployment compatibility for databases.
- data-governance — retention schedules, encryption key rotation, and PII handling in non-production restore drills.
- storage-uploads — implement owned file/object storage and upload/download flows with validated metadata, access and lifecycle.
- incident-response — diagnose and recover an owned service incident with bounded changes, timeline evidence and verified health. Use during outages, bad deployments or data/service degradation; preserve evidence and separate mitigation from root-cause repair.
