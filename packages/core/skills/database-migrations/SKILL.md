---
name: database-migrations
version: 1.0.1
description: "Design and verify schema migrations, bounded backfills and deployment compatibility for databases. Use when adding constraints or indexes, changing column types, evolving schemas or recovering failed migrations; distinguish reversible application rollback from data restoration."
trigger: "adding constraints or indexes, changing column types, evolving schemas or recovering failed migrations; distinguish reversible application rollback from data restoration."
required-capabilities: [filesystem.read, filesystem.write]
required-tools: []
optional-capabilities: [verification.run, web.research]
metadata:
  routing-group: data
paths: ["**/migrations/**"]
---

# Database Migrations

## Selection card
- Task: Deploy compatible schema changes and backfills.
- Start: Identify the data owner, query/schema, consistency and recovery contract.
- Finish: apply the acceptance checks below; report observed results and unresolved constraints.

## Overview

Ship schema changes that preserve data and work across deployment overlap.
Database engine, version and migration tool determine transactional DDL,
locking, index creation and rollback behavior.

## Rules

1. Inspect the current schema, migration history, engine/version, ORM and real
   readers/writers. Do not assume every DDL operation is transactional.
2. Use expand/backfill/validate/contract where old and new code overlap.
   Destructive contraction needs verified consumer retirement and a recovery plan.
3. Estimate lock/write amplification and data volume. Use bounded batches,
   stable progress keys, idempotency and checkpointed restart for large backfills.
4. Separate data restoration from a down migration. Dropped information cannot
   be recreated merely by reversing a schema statement.
5. Plan backup/restore or forward repair, monitor progress and define abort
   conditions. A backup existence check is not a tested restoration.
6. Use local fixtures or an authorized isolated database for verification;
   a migration plan does not authorize production execution.

## Workflow

1. Record invariants and compatibility across the old/new application versions.
2. Generate migrations with the project's tool and inspect resulting SQL,
   lock behavior, constraints and index strategy for the actual engine.
3. Apply to a fresh database and a representative existing schema.
4. Inject failure/restart in a bounded backfill and verify no omissions/duplicates.
   Compare row counts, constraints and important application queries.
5. Exercise rollback where reversible; otherwise test the documented forward
   repair/restore in the isolated environment.
6. Report migration commands, data verification, estimated production impact
   and the execution boundary.

## Core Patterns & Pitfalls

- **Zero-Downtime PostgreSQL Lock Discipline**: Set a bounded `lock_timeout` (e.g., `SET lock_timeout = '3s'`) before DDL so a blocked `ACCESS EXCLUSIVE` lock fails fast instead of queuing all application reads/writes behind it.
- **Online Index & Constraint Creation**: Create indexes on live tables with `CREATE INDEX CONCURRENTLY` (outside a transaction block), and add foreign-key or `CHECK` constraints as `NOT VALID` first (which takes only a brief lock) followed by `VALIDATE CONSTRAINT` in a separate step.
- **Anti-pattern — Renaming or Dropping Active Columns in One Deploy**: Dropping or renaming a column in the same deployment that updates application code breaks rolling pods (`vN-1`) and blocks instant application rollback; use the 4-phase expand → dual-write/backfill → switch reads → contract pattern.

## Sources

[PostgreSQL ALTER TABLE](https://www.postgresql.org/docs/current/sql-altertable.html)
is an engine-specific reference; use the selected engine's current documentation
and exact version for operational decisions.

## Acceptance checks

- [ ] Generated SQL inspected for table rewrites, `ACCESS EXCLUSIVE` lock duration, and transactional DDL rules
- [ ] Old (`vN-1`) and new (`vN`) application code remain compatible during rolling deployment overlap
- [ ] Large backfills batched by primary-key cursor with idempotent restart and progress checkpoints
- [ ] Migration tested against both an empty schema and representative existing data with rollback/forward-fix verified

## Skills in scope

- data-governance — data retention, PII anonymization, and audit compliance during schema/backfill changes.
- api-design — keeping public API payloads backward-compatible while underlying database columns evolve.
- testing — automated up/down/backfill migration tests against realistic seed datasets.
- observability — monitoring database lock waits, replication lag, and query latency during migration rollout.
