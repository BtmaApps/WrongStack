---
name: database-development
description: "Implement database access, models and queries with explicit consistency, transactions and bounded results. Use when working with SQL, document databases, Redis or ORM clients; use database-migrations for schema rollout/recovery and verify actual engine/client compatibility."
trigger: "Implement database access, models and queries with explicit consistency, transactions and bounded results. Use when working with SQL, document databases, Redis or ORM clients; use database-migrations for schema rollout/recovery and verify actual engine/client compatibility."
version: 1.0.2
required-capabilities: [filesystem.read]
required-tools: []
optional-capabilities: [filesystem.write, execution.shell, verification.run, web.research]
metadata:
  routing-group: data
  domain: "data"
paths: ["*.sql"]
---

# Database Development

## Selection card
- Task: Design database queries, indexes and transactions.
- Start: Identify the data owner, query/schema, consistency and recovery contract.
- Finish: apply the acceptance checks below; report observed results and unresolved constraints.

## Overview

Database engineering requires aligning schema constraints, composite indexes, transaction isolation levels, and connection pool lifecycles with real workload access patterns across SQL engines (PostgreSQL, MySQL, SQLite), document stores (MongoDB), and key-value/in-memory stores (Redis). Client ORM/driver upgrades must remain strictly separated from deployed database server versions and migration rollouts.

Checked 2026-10-23: PostgreSQL 18.6, MongoDB stable 9.0 series, Redis server 8.10.2; Prisma/client 7.10.1, Drizzle 0.45.4, MongoDB Node driver 7.7.0, Redis Node client 6.3.0. Prisma latest tag currently points at 8.0.0-rc.27: choose the verified stable release unless preview is requested.

## Rules

1. Identify database engine, server version, replication/pooler topology, ORM/driver version, and singleton client pool lifetime.
2. Enforce data invariants at the database boundary (`UNIQUE`, `FOREIGN KEY`, `CHECK`, `NOT NULL`) rather than relying solely on check-then-insert application races.
3. Bound every list/search query with explicit `LIMIT` and deterministic ordering (prefer keyset/cursor pagination `(created_at, id) < ($1, $2)` over deep `OFFSET`), and align composite index column order with equality/sort predicates.
4. Parameterize all values, whitelist dynamic sort/column identifiers, and enforce tenant/owner predicates on every read, update, and delete.
5. Keep database transactions short and free of external network/HTTP calls; use atomic `INSERT ... ON CONFLICT`, conditional `UPDATE ... WHERE`, or `SELECT ... FOR UPDATE` when coordinating concurrent state transitions.
6. Treat cache/document/relational consistency deliberately (`statement_timeout`, lock timeouts, outbox patterns); a client library version is not the server version.

## Core Patterns & Pitfalls

- **Atomic Upserts & Conditional Transitions**: Replace read-modify-write application races (`findUnique` then `create`/`update`) with single-statement `ON CONFLICT DO UPDATE` or optimistic version predicates (`WHERE id = $1 AND version = $2`), checking affected row counts.
- **Connection Pool Discipline**: Reuse a single shared database pool/client per process (with hot-reload guard in dev) and never hold an interactive transaction open while awaiting slow third-party webhooks, emails, or object-storage uploads.
- **Anti-pattern — Unbounded Queries & N+1 Loops**: Fetching an unpaginated table into application memory or issuing a query inside a `for` loop degrades nonlinearly with production data volume.

## Workflow

1. Trace callers, read/write contracts and existing persistence conventions.
2. Verify current stable engine/client/ORM support before upgrade.
3. Implement the narrow query/model operation with explicit transaction and failure behavior.
4. Test concurrency, uniqueness, empty/boundary data and rollback/retry cases.
5. Inspect relevant query performance and run application integration checks.

## Before returning

- [ ] Database engine version, pool lifecycle, and stable ORM/driver version verified
- [ ] Uniqueness, foreign keys, and tenant/ownership scoping enforced at the query/schema boundary
- [ ] List queries bounded with deterministic sort order and matching index coverage (no N+1 loops)
- [ ] Concurrent writes protected via atomic SQL/upsert, row locking, or optimistic version checks without external I/O inside transactions
- [ ] Schema changes handed off through the repository's migration workflow (`database-migrations`)

## Sources

Versioned facts checked 2026-10-23; refresh authoritative sources before new installs/upgrades.
[PostgreSQL](https://www.postgresql.org/docs/current/), [MongoDB releases](https://www.mongodb.com/docs/manual/release-notes/), [Redis clients](https://redis.io/docs/latest/develop/clients/).

## Skills in scope

- database-migrations — design and verify schema migrations, bounded backfills and deployment compatibility for databases.
- data-governance — PII classification, tenant isolation, retention policies, and audit-trail requirements.
- api-design — cursor/page pagination contracts, idempotency, and mapping database errors to safe API responses.
- backup-recovery — design and verify backups and restoration for owned databases, files and application state.
