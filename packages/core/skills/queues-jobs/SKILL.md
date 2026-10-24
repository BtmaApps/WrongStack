---
name: queues-jobs
description: "Implement reliable asynchronous jobs and message consumers with explicit delivery, retry and shutdown semantics. Use when adding BullMQ or another established queue, background processing or scheduled work; enqueue success is not job completion."
trigger: "Implement reliable asynchronous jobs and message consumers with explicit delivery, retry and shutdown semantics. Use when adding BullMQ or another established queue, background processing or scheduled work; enqueue success is not job completion."
version: 1.0.2
required-capabilities: [filesystem.read]
required-tools: []
optional-capabilities: [filesystem.write, execution.shell, verification.run, web.research]
metadata:
  routing-group: data
  domain: "data"
---

# Queues Jobs

## Selection card
- Task: Build bounded retries, background jobs and deduplication.
- Start: Identify the data owner, query/schema, consistency and recovery contract.
- Finish: apply the acceptance checks below; report observed results and unresolved constraints.

## Overview

Asynchronous queues and background workers (BullMQ, Cloudflare Queues, SQS/RabbitMQ consumers) provide **at-least-once** delivery where messages can be retried, delivered out of order, or processed concurrently after a visibility/lock lease expires. Reliable background processing requires small versioned payloads, idempotent handlers, fencing against stale workers, bounded retry/dead-letter policies, and graceful worker drain on shutdown.

Checked BullMQ stable target: 6.4.1 on 2026-10-23. Verify current broker/client/worker compatibility and actual delivery guarantees before implementation.

## Rules

1. Define deterministic job identity (`jobId` / deduplication key), schema version, tenant/resource ownership, and persisted job status (`queued`, `processing`, `succeeded`, `failed`).
2. Design every consumer for at-least-once and out-of-order delivery; enqueueing a job (`202 Accepted`) is not proof that the business side effect completed.
3. Keep job payloads small (pass entity IDs and version/generation tokens rather than large mutable blobs) and make side effects idempotent or guarded by atomic database state checks before acknowledging (`ack`).
4. Configure explicit `attempts`, exponential/jittered `backoff`, worker `concurrency`, lock/visibility timeout, retention (`removeOnComplete` / `removeOnFail`), and dead-letter handling; fail permanent validation/business errors immediately (`UnrecoverableError`) without wasting retries.
5. Guard against lease/lock expiry and stale worker completion by checking the entity's current state/generation or lock token at commit time, and close workers gracefully (`await worker.close()`) on `SIGTERM`/`SIGINT`.
6. Keep recurring/cron schedules opt-in when the user did not request recurring execution.

## Core Patterns & Pitfalls

- **Transactional Enqueue & Outbox Discipline**: Never enqueue a job that reads a newly created database row *before* the database transaction commits, or the worker may execute first and fail on a missing row. Enqueue after commit or use a transactional outbox table.
- **Fencing Stale Workers**: If a worker pauses or exceeds its lock/visibility timeout, a second worker may claim the same job. Use conditional updates (`UPDATE jobs SET status = 'completed' WHERE id = $1 AND attempt_token = $2`) so the tardy first worker cannot overwrite newer state.
- **Anti-pattern — Retrying Non-Transient Errors Forever**: Retrying `4xx` validation errors, deleted accounts, or malformed payloads without `UnrecoverableError` / DLQ routing clogs worker concurrency and masks real outages.

## Workflow

1. Map producer, broker, consumer and persistent side effects.
2. Choose supported current APIs and specify delivery/recovery contracts.
3. Implement bounded processing and observable lifecycle state.
4. Test duplicate delivery, partial failure, restart, retry exhaustion and stale completion.
5. Verify shutdown/drain behavior and user completion signals.

## Before returning

- [ ] Broker/queue client version and delivery guarantees (at-least-once, visibility timeout) verified
- [ ] Job payloads versioned and handlers idempotent across duplicate or out-of-order deliveries
- [ ] Retry attempts, backoff, concurrency, lock duration, and unrecoverable/DLQ routing bounded
- [ ] Stale worker completion fenced and graceful shutdown (`worker.close()`) wired to process signals
- [ ] Duplicate delivery, retry exhaustion, and post-commit visibility verified in tests

## Sources

Versioned facts checked 2026-10-23; refresh authoritative sources before new installs/upgrades.
[BullMQ](https://docs.bullmq.io/), [Cloudflare Queues](https://developers.cloudflare.com/queues/).

## Skills in scope

- api-design — `202 Accepted` status endpoints, job polling/webhook status contracts, and idempotency keys.
- database-development — implement database access, models and queries with explicit consistency, transactions and bounded results.
- observability — queue depth, job age, retry/DLQ rate metrics, and trace context propagation across producers and consumers.
- testing — deterministic duplicate-delivery, retry-exhaustion, and stale-lease completion tests.
