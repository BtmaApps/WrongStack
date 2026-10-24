---
name: node-backend
description: "Build and upgrade Node.js HTTP services with typed validation, lifecycle ownership and production behavior. Use when implementing Hono, Fastify, NestJS or another established Node server; use node-modern for runtime I/O details and preserve the chosen framework."
trigger: "Build and upgrade Node.js HTTP services with typed validation, lifecycle ownership and production behavior. Use when implementing Hono, Fastify, NestJS or another established Node server; use node-modern for runtime I/O details and preserve the chosen framework."
version: 1.0.2
required-capabilities: [filesystem.read]
required-tools: []
optional-capabilities: [filesystem.write, execution.shell, verification.run, web.research]
metadata:
  routing-group: backend
  domain: "backend"
---

# Node Backend

## Selection card
- Task: Implement Node server endpoints and shutdown.
- Start: Locate the endpoint, schema, authentication boundary and caller.
- Finish: apply the acceptance checks below; report observed results and unresolved constraints.

## Overview

Production Node.js HTTP services (Hono, Fastify, NestJS) rely on boundary schema validation, request-scoped context isolation (`AsyncLocalStorage` / framework request context), bounded body/concurrency limits, and coordinated graceful shutdown across HTTP listeners, database pools, and background consumers.

Checked 2026-10-23: Hono 4.13.13, Fastify 5.12.7 and NestJS 12.2.0. Latest stable Node target is 26.12.1 (LTS 24.22.1); verify framework/plugins/adapter requirements together.

## Rules

1. Inspect framework lifecycle, plugin/dependency injection order and actual runtime adapter.
2. Validate input and serialize public output at the route boundary; do not expose database rows or internal exceptions wholesale.
3. Bound request bodies, external calls (`AbortSignal.timeout`) and expensive work according to application limits.
4. Keep per-request auth/context isolated and authorize each operation/object at the server boundary.
5. Make startup, readiness (`/readyz` vs `/healthz`) and graceful shutdown (`SIGTERM` / `SIGINT`) include owned pools/listeners/jobs.
6. Verify framework error/cancellation semantics; returning an error-shaped object without setting the HTTP status may still produce a `200 OK` response.

## Core Patterns & Pitfalls

- **Graceful Drain Sequence**: On `SIGTERM`/`SIGINT`, mark readiness unhealthy, stop accepting new connections (`server.close()`), wait for in-flight requests with a bounded deadline, and only then close database/Redis pools (`db.end()`, `redis.quit()`).
- **Schema-Driven Serialization**: Use Fastify response schemas, Hono validator middleware (`@hono/zod-validator`), or NestJS DTO pipes/interceptors so internal model fields (password hashes, internal flags) cannot leak into JSON responses.
- **Anti-pattern — Unhandled Floating Promises in Route Handlers**: Firing unawaited promises inside a request handler without error boundaries or lifecycle tracking risks unhandled rejections and dropped work during container drain.

## Workflow

1. Trace route → service → persistence/external operation and existing conventions.
2. Resolve latest stable targets and supported plugins before migration.
3. Implement the feature with explicit contracts and lifecycle cleanup.
4. Test valid/invalid/unauthorized input, dependency failure and stop/restart.
5. Run configured type/lint/tests and a production server health/user-path check.

## Before returning

- [ ] Node runtime target and framework/plugin versions verified against lockfile
- [ ] Route inputs validated and outputs serialized through explicit DTO/schema contracts
- [ ] Request body size, outbound request timeouts, and object-level auth enforced
- [ ] Graceful shutdown drains in-flight requests before closing DB/queue pools
- [ ] Error responses verified to return intended HTTP status codes and safe payloads

## Sources

Versioned facts checked 2026-10-23; refresh authoritative sources before new installs/upgrades.
[Hono](https://hono.dev/docs/), [Fastify](https://fastify.dev/docs/latest/), [NestJS](https://docs.nestjs.com/).

## Skills in scope

- node-modern — event-loop non-blocking I/O, streams, `AbortSignal` cancellation, and worker threads.
- api-design — HTTP status semantics, idempotency keys, pagination, and RFC 9457 Problem Details error contracts.
- database-development — implement database access, models and queries with explicit consistency, transactions and bounded results.
- authentication-sessions — implement application sign-in, sessions and identity integration with explicit account/tenant authorization.
- queues-jobs — implement reliable asynchronous jobs and message consumers with explicit delivery, retry and shutdown semantics.
